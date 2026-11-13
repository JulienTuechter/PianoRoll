/**
 * Verdrahtung der Core-Module zu einer laufenden App (Singletons).
 * Renderer lesen `live` / `getEngine()` direkt pro Frame – kein React-Rerender pro Tastendruck.
 */
import { ToneAudioEngine } from '../core/audio-engine/tone-engine';
import { createDemoMidi } from '../core/demo/demo-song';
import {
  addSong,
  markPracticed,
  overridesToTracks,
  recordRun,
  renameSong,
  updateEntry,
} from '../core/library/library';
import type { SongSource } from '../core/library/types';
import { browserMidiEnvironment } from '../core/midi-input/browser-env';
import { InputHub } from '../core/midi-input/input-hub';
import { WebMidiConnection } from '../core/midi-input/web-midi';
import { loadMidiFile, playableNotes, reassignHands, titleFromFileName } from '../core/midi-file-loader/load';
import {
  buildMeasures,
  measureIndexAt,
  TempoMap,
  type MeasureInfo,
} from '../core/note-event-model/tempo-map';
import type { NoteEvent, Song, TrackInfo } from '../core/note-event-model/types';
import { NoteScheduler } from '../core/playback/note-scheduler';
import { TimeScheduler } from '../core/playback/time-scheduler';
import { Transport } from '../core/playback/transport';
import {
  beatSecAt,
  buildBeatGrid,
  buildCountIn,
  type Beat,
  type CountIn,
} from '../core/practice-engine/beats';
import type { EngineEvent, KeyJudgement, PlayEngine } from '../core/practice-engine/engine-types';
import {
  defaultLoopAt,
  loopBounds,
  LoopTrainer,
  type LoopBounds,
  type LoopRange,
} from '../core/practice-engine/loop';
import { PerformanceEngine } from '../core/practice-engine/performance-engine';
import { countsOf, passSummary, type StatCounts } from '../core/scoring/scoring';
import { performanceClock } from '../core/time/clock';
import {
  defaultWaitConfig,
  isPracticed,
  WaitModeEngine,
  type HandFilter,
} from '../core/wait-mode-engine/wait-mode-engine';
import type { KeyFlash } from './canvas/keyboard-renderer';
import { libraryRepo } from './library-repo';
import { useApp } from './store/app-store';
import { settingsHydrated, useSettings, type Settings } from './store/settings';
import { setHandColors } from './theme';

export const hub = new InputHub();
export const transport = new Transport(performanceClock);
export const audio = new ToneAudioEngine();
const noteScheduler = new NoteScheduler([]);
const beatScheduler = new TimeScheduler<Beat>([]);
const countInScheduler = new TimeScheduler<Beat>([]);
const trainer = new LoopTrainer({ enabled: false, cleanPasses: 3, stepPercent: 5, maxRate: 1 });
let engine: PlayEngine | null = null;
let engineOff: (() => void) | null = null;
let passStart: StatCounts | null = null;
let passIndex = 0;
let tempoMap: TempoMap | null = null;

/** Daten, die die Renderer pro Frame lesen. */
export const live = {
  notes: [] as NoteEvent[],
  maxDurationSec: 0,
  measures: [] as MeasureInfo[],
  beats: [] as Beat[],
  /** Wait/Performance: geübte Hand(e); andere Noten werden gedimmt. Anschauen: null */
  practiced: null as HandFilter | null,
  /** Nachleuchtende Bewertungen: midi → Art + Ablaufzeit (performance.now) */
  flashes: new Map<number, KeyFlash>(),
  countIn: null as CountIn | null,
  loop: null as LoopBounds | null,
  /** Tempo-Map des aktuellen Stücks (Sekunden ↔ Ticks, z. B. für den Noten-Cursor) */
  tempoMap: null as TempoMap | null,
};

export function getEngine(): PlayEngine | null {
  return engine;
}

export function getWaitEngine(): WaitModeEngine | null {
  return engine instanceof WaitModeEngine ? engine : null;
}

export const webMidi = new WebMidiConnection(
  browserMidiEnvironment(),
  (e) => hub.emit(e),
  () => hub.releaseSource('midi', performance.now()),
);

const SESSION_KEYS: (keyof Settings)[] = [
  'mode',
  'waitHands',
  'accompaniment',
  'strict',
  'chordToleranceMs',
  'hintAfterErrors',
  'perfectMs',
  'goodMs',
  'latencyMs',
];

/** Regelmäßiger Takt (25 ms): Engine-Update, Loop, Noten/Metronom/Count-in planen. */
function pump(): void {
  if (transport.state !== 'playing') return;
  let pos = transport.position;
  if (transport.state !== 'playing') return;
  engine?.update();

  if (live.countIn && pos >= live.countIn.startSec) live.countIn = null;

  const loop = live.loop;
  if (loop && pos >= loop.endSec - 1e-4) {
    completeLoopPass();
    transport.seek(loop.startSec);
    pos = transport.position;
  }

  const rate = transport.rate;
  const limit = Math.min(transport.holdAt ?? Infinity, loop?.endSec ?? Infinity);
  for (const s of noteScheduler.tick(pos, rate, limit)) {
    audio.playNote('app', s.note.midi, s.note.velocity, s.delaySec, s.durationSec);
  }
  for (const b of countInScheduler.tick(pos, rate)) audio.click(b.item.accent, b.delaySec);
  const beats = beatScheduler.tick(pos, rate, limit);
  if (useSettings.getState().metronome) for (const b of beats) audio.click(b.item.accent, b.delaySec);
}

function completeLoopPass(): void {
  passIndex++;
  let tempoUp: number | null = null;
  if (engine && passStart) {
    engine.completePass();
    const summary = passSummary(passStart, countsOf(engine.stats));
    const s = useSettings.getState();
    trainer.setConfig({
      enabled: s.autoTempo,
      cleanPasses: s.autoTempoPasses,
      stepPercent: s.autoTempoStepPercent,
      maxRate: s.autoTempoMaxPercent / 100,
    });
    const outcome = trainer.passCompleted(summary.clean, transport.rate);
    if (outcome.newRate !== null) {
      tempoUp = outcome.newRate;
      setRate(outcome.newRate);
    }
    useApp
      .getState()
      .set({ lastPass: { ...summary, index: passIndex, cleanStreak: trainer.cleanStreak, tempoUp } });
    passStart = countsOf(engine.stats);
  } else {
    useApp.getState().set({
      lastPass: {
        correct: 0,
        wrong: 0,
        extra: 0,
        missed: 0,
        accuracy: 1,
        clean: false,
        index: passIndex,
        cleanStreak: 0,
        tempoUp,
      },
    });
  }
}

let started = false;

export function startRuntime(): () => void {
  if (started) return () => {};
  started = true;
  let disposed = false;

  const offMidi = webMidi.onStateChange((midi) => useApp.getState().set({ midi }));

  const offInput = hub.subscribe((e) => {
    // Während des Einzählens zählen Anschläge erst kurz vor dem Startpunkt (vorher: Einspielen, kein Fehler)
    const ci = live.countIn;
    const duringCountIn =
      ci !== null && e.type === 'noteon' && transport.position < ci.startSec - COUNT_IN_GRACE_SEC;
    if (engine && !duringCountIn) {
      engine.handleInput(e);
      pump(); // Begleitung zur gerade erfüllten Gruppe sofort spielen
    }
    const s = useSettings.getState();
    const audible = e.source === 'midi' ? s.echo : s.simulatorSound;
    if (e.type === 'noteon' && audible) audio.noteOn('echo', e.midi, e.velocity);
    else if (e.type === 'noteoff') audio.noteOff('echo', e.midi);
    else if (e.type === 'sustain') audio.setSustain('echo', e.down);
  });

  const applyAudioSettings = (s = useSettings.getState()) => {
    audio.setVolume('echo', s.echoVolume);
    audio.setVolume('app', s.appVolume);
    audio.setMuted('app', !s.appSound);
    audio.setVolume('metronome', s.metronomeVolume);
  };
  applyAudioSettings();

  const offSettings = useSettings.subscribe((s, prev) => {
    if (
      s.echoVolume !== prev.echoVolume ||
      s.appVolume !== prev.appVolume ||
      s.appSound !== prev.appSound ||
      s.metronomeVolume !== prev.metronomeVolume
    ) {
      applyAudioSettings(s);
    }
    if (s.rightColor !== prev.rightColor || s.leftColor !== prev.leftColor)
      setHandColors(s.rightColor, s.leftColor);
    if (SESSION_KEYS.some((k) => s[k] !== prev[k])) rebuildSession();
  });

  const offLoop = useApp.subscribe((a, prev) => {
    if (a.loop !== prev.loop || a.loopEnabled !== prev.loopEnabled) applyLoop();
  });

  const offTransport = transport.onStateChange((state) => {
    noteScheduler.reset(transport.position);
    beatScheduler.reset(transport.position);
    if (state !== 'playing') {
      audio.allNotesOff('app');
      if (state !== 'paused') live.countIn = null;
    }
    useApp.getState().set({ transport: state });
    const song = useApp.getState().song;
    if (state === 'playing' && engine && song)
      void markPracticed(libraryRepo, song.id, Date.now()).then(refreshLibrary);
  });
  const offSeek = transport.onSeek((pos) => {
    audio.allNotesOff('app');
    noteScheduler.reset(pos);
    beatScheduler.reset(pos);
  });

  // Interval statt rAF, damit Audio auch bei verdecktem Tab weiterläuft
  const timer = setInterval(pump, 25);

  // Audio erst nach Nutzergeste freischalten (Autoplay-Policy). Ein Anschlag am Piano zählt dafür nicht.
  const unlock = () => {
    if (useApp.getState().audio !== 'locked') return;
    useApp.getState().set({ audio: 'loading' });
    audio
      .resume()
      .then(() => {
        applyAudioSettings();
        useApp.getState().set({ audio: audio.usingFallback ? 'fallback' : 'ready' });
      })
      .catch(() => useApp.getState().set({ audio: 'locked' }));
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // Erst nach dem Laden der Einstellungen: MIDI verbinden, Bibliothek laden, letztes Stück öffnen
  void settingsHydrated().then(async () => {
    if (disposed) return;
    const s = useSettings.getState();
    setHandColors(s.rightColor, s.leftColor);
    void webMidi.connect(s.midiDeviceId);
    await refreshLibrary();
    if (s.lastSongId && !useApp.getState().song) await openFromLibrary(s.lastSongId).catch(() => {});
    useApp.getState().set({ ready: true });
  });

  return () => {
    disposed = true;
    offMidi();
    offInput();
    offSettings();
    offLoop();
    offTransport();
    offSeek();
    clearInterval(timer);
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    webMidi.dispose();
    started = false;
  };
}

const FLASH_MS = 350;
/** So lange vor Ende des Count-ins werden Anschläge schon gewertet (leicht zu frühes Einsetzen) */
const COUNT_IN_GRACE_SEC = 0.3;

function onEngineEvent(e: EngineEvent): void {
  const now = performance.now();
  if (e.type === 'wrong') live.flashes.set(e.midi, { kind: 'wrong', untilMs: now + FLASH_MS });
  if (e.type === 'hit') {
    const kind: KeyJudgement = e.grade === 'perfect' ? 'correct' : e.offsetMs < 0 ? 'early' : 'late';
    live.flashes.set(e.midi, { kind, untilMs: now + FLASH_MS });
  }
  if (e.type === 'finished') {
    const song = useApp.getState().song;
    useApp.getState().set({ lastResult: e.result, resultsOpen: true });
    if (song) void recordRun(libraryRepo, song.id, e.result).then(refreshLibrary);
  }
}

/** Baut Engine und Scheduler-Notenliste passend zu Modus und Einstellungen neu auf. */
function rebuildSession(): void {
  engineOff?.();
  engine?.dispose();
  engine = null;
  engineOff = null;
  live.flashes.clear();

  const song = useApp.getState().song;
  const s = useSettings.getState();
  const pos = transport.position;
  if (!song) {
    live.practiced = null;
    noteScheduler.setNotes([], 0);
    beatScheduler.setItems([], 0);
    return;
  }
  const notes = live.notes;
  if (s.mode === 'wait') {
    engine = new WaitModeEngine(
      transport,
      performanceClock,
      notes,
      {
        ...defaultWaitConfig,
        hands: s.waitHands,
        strict: s.strict,
        chordToleranceMs: s.chordToleranceMs,
        hintAfterErrors: s.hintAfterErrors,
      },
      live.measures,
    );
  } else if (s.mode === 'performance') {
    engine = new PerformanceEngine(
      transport,
      performanceClock,
      notes,
      {
        hands: s.waitHands,
        perfectMs: s.perfectMs,
        goodMs: Math.max(s.goodMs, s.perfectMs),
        catchMs: Math.max(250, s.goodMs * 2),
        latencyMs: s.latencyMs,
      },
      live.measures,
    );
  }
  if (engine) {
    engineOff = engine.on(onEngineEvent);
    live.practiced = s.waitHands;
    noteScheduler.setNotes(
      s.accompaniment ? notes.filter((n) => !isPracticed(n.hand, s.waitHands)) : [],
      pos,
    );
  } else {
    live.practiced = null;
    noteScheduler.setNotes(notes, pos);
  }
  beatScheduler.setItems(live.beats, pos);
  audio.allNotesOff('app');
  applyLoop();
}

/** Überträgt den Loop aus dem Store auf Renderer und Engine. */
function applyLoop(): void {
  const { loop, loopEnabled, song } = useApp.getState();
  const bounds = loopEnabled && loop && song ? loopBounds(loop, live.measures, song.durationSec) : null;
  live.loop = bounds;
  engine?.setRange(bounds?.startSec ?? 0, bounds?.endSec ?? null);
  trainer.reset();
  passIndex = 0;
  passStart = engine ? countsOf(engine.stats) : null;
  useApp.getState().set({ lastPass: null });
  // Steht/läuft das Stück außerhalb des neuen Loops, an dessen Anfang springen
  if (bounds) {
    const pos = transport.position;
    if (pos < bounds.startSec - 0.01 || pos >= bounds.endSec) {
      if (transport.state === 'ended') transport.stop();
      transport.seek(bounds.startSec);
    }
  }
}

// ---------- Transport-Aktionen ----------

/** Play/Pause. Beim Start gibt es (falls eingestellt) einen Count-in als Vorlauf. */
export function togglePlay(): void {
  if (!useApp.getState().song) return;
  if (transport.state === 'playing') {
    transport.pause();
    return;
  }
  const s = useSettings.getState();
  let start = transport.state === 'ended' ? 0 : transport.position;
  // Pausiert während des Count-ins → am eigentlichen Ziel fortsetzen
  if (live.countIn && start < live.countIn.startSec) start = live.countIn.startSec;
  start = Math.max(0, start);
  const loop = live.loop;
  if (loop && (start < loop.startSec - 0.01 || start >= loop.endSec - 0.01)) start = loop.startSec;
  if (transport.state === 'ended') transport.stop();

  let ci: CountIn | null = null;
  const measureIdx = measureIndexAt(live.measures, start);
  const measure = live.measures[measureIdx];
  if (s.countInBars > 0 && measure && tempoMap) {
    ci = buildCountIn(start, s.countInBars, measure.numerator, beatSecAt(measure, tempoMap.ppq, tempoMap));
  }
  live.countIn = ci;
  transport.seek(start, ci?.prerollSec ?? 0);
  countInScheduler.setItems(ci?.beats ?? [], transport.position);
  if (passStart === null && engine) passStart = countsOf(engine.stats);
  transport.play();
}

export function setSong(song: Song, keepPosition = false): void {
  const pos = keepPosition ? transport.position : 0;
  const wasPlaying = keepPosition && transport.state === 'playing';
  const notes = playableNotes(song);
  live.notes = notes;
  live.maxDurationSec = notes.reduce((m, n) => Math.max(m, n.durationSec), 0);
  tempoMap = new TempoMap(song.ppq, song.tempos);
  live.tempoMap = tempoMap;
  live.measures = buildMeasures(
    song.ppq,
    song.timeSignatures,
    tempoMap,
    tempoMap.secToTick(song.durationSec) - 1,
  );
  live.beats = buildBeatGrid(live.measures, song.ppq, tempoMap).filter(
    (b) => b.startSec <= song.durationSec + 0.5,
  );
  live.countIn = null;
  audio.allNotesOff('app');
  transport.setDuration(song.durationSec + 0.5);
  const prev = useApp.getState().song;
  const sameSong = prev?.id === song.id;
  useApp.getState().set({
    song,
    error: null,
    ...(sameSong ? {} : { loop: null, loopEnabled: false, lastPass: null }),
  });
  rebuildSession();
  if (pos > 0) transport.seek(pos);
  if (wasPlaying) transport.play();
}

export function unloadSong(): void {
  transport.setDuration(0);
  live.notes = [];
  live.measures = [];
  live.beats = [];
  live.maxDurationSec = 0;
  tempoMap = null;
  live.tempoMap = null;
  useApp.getState().set({ song: null, loop: null, loopEnabled: false });
  rebuildSession();
  useSettings.getState().update({ lastSongId: null });
}

export async function refreshLibrary(): Promise<void> {
  try {
    useApp.getState().set({ library: await libraryRepo.list() });
  } catch (err) {
    console.warn('Bibliothek konnte nicht geladen werden', err);
  }
}

function showError(err: unknown): void {
  useApp.getState().set({ error: err instanceof Error ? err.message : String(err) });
}

/** Lädt Bytes, legt sie in der Bibliothek ab und öffnet das Stück (mit gespeicherten Korrekturen). */
async function importAndOpen(
  bytes: Uint8Array,
  fileName: string,
  source: SongSource,
  title?: string,
): Promise<void> {
  const s = useSettings.getState();
  const parsed = loadMidiFile(bytes, {
    title: title ?? titleFromFileName(fileName),
    splitPoint: s.splitPoint,
  });
  try {
    await addSong(libraryRepo, parsed, bytes, fileName, source, Date.now());
  } catch (err) {
    console.warn('Speichern in der Bibliothek fehlgeschlagen', err);
  }
  await openFromLibrary(parsed.id, parsed);
}

export async function loadFile(file: File): Promise<void> {
  if (!/\.(mid|midi)$/i.test(file.name)) {
    showError(`„${file.name}“ ist keine MIDI-Datei (.mid/.midi).`);
    return;
  }
  try {
    await importAndOpen(new Uint8Array(await file.arrayBuffer()), file.name, 'file');
    useApp.getState().set({ libraryOpen: false });
  } catch (err) {
    showError(err);
  }
}

export async function loadDemo(): Promise<void> {
  try {
    await importAndOpen(createDemoMidi(), 'demo.mid', 'demo', 'Demo – Erste Schritte');
    useApp.getState().set({ libraryOpen: false });
  } catch (err) {
    showError(err);
  }
}

/** Öffnet ein Stück aus der Bibliothek. `parsed` erspart erneutes Parsen direkt nach dem Import. */
export async function openFromLibrary(id: string, parsed?: Song): Promise<void> {
  const entry = await libraryRepo.get(id);
  let song = parsed;
  if (!song) {
    const bytes = await libraryRepo.getBytes(id);
    if (!bytes || !entry) throw new Error('Stück nicht in der Bibliothek gefunden.');
    song = loadMidiFile(bytes, { title: entry.title, splitPoint: useSettings.getState().splitPoint });
  }
  if (entry) {
    song = { ...song, title: entry.title };
    song = reassignHands(song, overridesToTracks(song, entry), entry.splitPoint ?? song.splitPoint);
  }
  setSong(song);
  useApp.getState().set({ libraryOpen: false, lastResult: null, resultsOpen: false });
  useSettings.getState().update({ lastSongId: id });
  await refreshLibrary();
}

async function saveSongOverrides(song: Song): Promise<void> {
  await updateEntry(libraryRepo, song.id, {
    trackOverrides: song.tracks.map((t) => ({ handAssignment: t.handAssignment, enabled: t.enabled })),
    splitPoint: song.splitPoint,
  });
}

export function updateTracks(tracks: TrackInfo[]): void {
  const song = useApp.getState().song;
  if (!song) return;
  const next = reassignHands(song, tracks, song.splitPoint);
  setSong(next, true);
  void saveSongOverrides(next);
}

export function setSongSplitPoint(splitPoint: number): void {
  const song = useApp.getState().song;
  if (!song) return;
  const next = reassignHands(song, song.tracks, splitPoint);
  setSong(next, true);
  void saveSongOverrides(next);
}

export async function renameLibrarySong(id: string, title: string): Promise<void> {
  const e = await renameSong(libraryRepo, id, title);
  const song = useApp.getState().song;
  if (e && song?.id === id) useApp.getState().set({ song: { ...song, title: e.title } });
  await refreshLibrary();
}

export async function deleteLibrarySong(id: string): Promise<void> {
  await libraryRepo.delete(id);
  if (useApp.getState().song?.id === id) unloadSong();
  await refreshLibrary();
}

export function setRate(rate: number): void {
  transport.setRate(rate);
  noteScheduler.reset(transport.position);
  beatScheduler.reset(transport.position);
  countInScheduler.reset(transport.position);
  useApp.getState().set({ rate: transport.rate });
}

export function seek(sec: number): void {
  live.countIn = null;
  countInScheduler.setItems([], 0);
  transport.seek(sec);
}

export function seekToMeasure(index: number): void {
  const m = live.measures[index];
  if (m) seek(m.startSec);
}

/** Neuer Durchgang von vorn (bzw. vom Loop-Anfang). */
export function restartRun(): void {
  transport.stop();
  if (live.loop) transport.seek(live.loop.startSec);
  togglePlay();
}

export function currentMeasure(): number {
  return measureIndexAt(live.measures, Math.max(0, transport.position));
}

/** Springt zum Taktanfang davor/danach. Innerhalb der ersten 0,3 s eines Takts geht „zurück“ zum vorherigen. */
export function seekMeasure(delta: -1 | 1): void {
  const pos = transport.position;
  const ms = live.measures;
  if (ms.length === 0) return;
  const idx = currentMeasure();
  const cur = ms[idx]!;
  let target: number;
  if (delta < 0) target = pos - cur.startSec > 0.3 ? idx : idx - 1;
  else target = idx + 1;
  const m = ms[Math.max(0, Math.min(ms.length - 1, target))];
  if (m) seek(m.startSec);
}

// ---------- Loop & Metronom ----------

export function setLoop(range: LoopRange | null, enabled = range !== null): void {
  useApp.getState().set({ loop: range, loopEnabled: enabled });
}

/** L: Loop an/aus. Ohne Auswahl → 4 Takte ab dem aktuellen. */
export function toggleLoop(): void {
  const { loop, loopEnabled } = useApp.getState();
  if (loopEnabled) {
    useApp.getState().set({ loopEnabled: false });
    return;
  }
  const range = loop ?? defaultLoopAt(currentMeasure(), live.measures.length);
  if (range) setLoop(range, true);
}

export function toggleMetronome(): void {
  const s = useSettings.getState();
  s.update({ metronome: !s.metronome });
}
