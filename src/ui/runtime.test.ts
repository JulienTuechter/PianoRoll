// @vitest-environment jsdom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoMidi } from '../core/demo/demo-song';
import { MidiFileError } from '../core/midi-file-loader/load';

/** Audio-Attrappe: zeichnet Aufrufe auf, statt Tone.js zu starten. */
vi.mock('../core/audio-engine/tone-engine', () => {
  class FakeAudio {
    ready = true;
    usingFallback = false;
    calls: { fn: string; args: unknown[] }[] = [];
    private rec(fn: string, args: unknown[]) {
      this.calls.push({ fn, args });
    }
    resume() {
      return Promise.resolve();
    }
    noteOn(...a: unknown[]) {
      this.rec('noteOn', a);
    }
    noteOff(...a: unknown[]) {
      this.rec('noteOff', a);
    }
    playNote(...a: unknown[]) {
      this.rec('playNote', a);
    }
    click(...a: unknown[]) {
      this.rec('click', a);
    }
    setSustain(...a: unknown[]) {
      this.rec('setSustain', a);
    }
    allNotesOff(...a: unknown[]) {
      this.rec('allNotesOff', a);
    }
    setVolume() {}
    setMuted() {}
  }
  return { ToneAudioEngine: FakeAudio };
});

vi.mock('./library-repo', async () => {
  const { MemoryLibraryRepository } = await import('../core/library/memory-repository');
  return { libraryRepo: new MemoryLibraryRepository() };
});

const rt = await import('./runtime');
const { useApp } = await import('./store/app-store');
const { useSettings, settingsHydrated } = await import('./store/settings');
const { libraryRepo } = await import('./library-repo');

type FakeAudio = { calls: { fn: string; args: unknown[] }[] };
const audioCalls = (fn: string) => (rt.audio as unknown as FakeAudio).calls.filter((c) => c.fn === fn);
const clearAudio = () => ((rt.audio as unknown as FakeAudio).calls.length = 0);

let stop: () => void;

beforeAll(async () => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'],
  });
  await settingsHydrated();
  stop = rt.startRuntime();
});

afterAll(() => {
  stop();
  vi.useRealTimers();
});

async function openDemo(): Promise<void> {
  await rt.importBytes(createDemoMidi(), 'demo.mid', 'demo', 'Demo');
}

beforeEach(async () => {
  rt.transport.stop();
  useSettings.getState().update({ mode: 'wait', countInBars: 0, metronome: false, accompaniment: true });
  useApp.getState().set({ loop: null, loopEnabled: false, error: null });
  await openDemo();
  clearAudio();
});

describe('Stück laden', () => {
  it('übernimmt das Stück in Bibliothek, Store und Renderer-Daten', async () => {
    const song = useApp.getState().song!;
    expect(song.title).toBe('Demo');
    expect(rt.live.notes.length).toBeGreaterThan(0);
    expect(rt.live.measures).toHaveLength(8);
    expect(rt.live.beats.length).toBeGreaterThanOrEqual(32);
    expect(rt.transport.duration).toBeCloseTo(song.durationSec + 0.5);
    expect((await libraryRepo.list()).map((e) => e.title)).toContain('Demo');
    expect(useSettings.getState().lastSongId).toBe(song.id);
  });

  it('weist Nicht-MIDI-Dateien mit lesbarer Meldung ab', async () => {
    await rt.loadFile(new File(['x'], 'notizen.txt'));
    expect(useApp.getState().error).toMatch(/notizen\.txt/);
  });

  it('übersetzt Ladefehler aus dem Kern', () => {
    expect(rt.errorMessage(new MidiFileError('x', 'empty'))).toMatch(/keine Noten|no notes/);
    expect(rt.errorMessage('kaputt')).toBe('kaputt');
  });

  it('schließt und löscht Stücke', async () => {
    const id = useApp.getState().song!.id;
    rt.closeSong();
    expect(useApp.getState().song).toBeNull();
    expect(useApp.getState().freePlay).toBe(true);
    expect(rt.live.notes).toEqual([]);
    await rt.openFromLibrary(id);
    expect(useApp.getState().song?.id).toBe(id);
    await rt.deleteLibrarySong(id);
    expect(useApp.getState().song).toBeNull();
    expect(await libraryRepo.get(id)).toBeUndefined();
  });
});

describe('Modi und Engine', () => {
  it('baut die Engine passend zum Modus', () => {
    expect(rt.getWaitEngine()).not.toBeNull();
    useSettings.getState().update({ mode: 'performance' });
    expect(rt.getEngine()?.mode).toBe('performance');
    useSettings.getState().update({ mode: 'watch' });
    expect(rt.getEngine()).toBeNull();
    expect(rt.live.practiced).toBeNull();
  });

  it('spielt im Anschauen-Modus alle Noten vor', () => {
    useSettings.getState().update({ mode: 'watch' });
    rt.togglePlay();
    vi.advanceTimersByTime(1000);
    expect(audioCalls('playNote').length).toBeGreaterThan(0);
    rt.togglePlay();
    expect(rt.transport.state).toBe('paused');
  });

  it('wertet Anschläge im Warten-Modus und leuchtet falsche Tasten auf', () => {
    useSettings.getState().update({ waitHands: 'right' });
    const engine = rt.getWaitEngine()!;
    rt.togglePlay();
    const before = engine.currentGroupIndex;
    rt.hub.emit({ type: 'noteon', midi: 61, velocity: 0.7, timeMs: performance.now(), source: 'keyboard' });
    expect(rt.live.flashes.get(61)?.kind).toBe('wrong');
    rt.hub.emit({ type: 'noteon', midi: 64, velocity: 0.7, timeMs: performance.now(), source: 'keyboard' });
    expect(engine.currentGroupIndex).toBeGreaterThan(before);
    // Simulator ist hörbar (Standard), MIDI-Echo nicht
    expect(audioCalls('noteOn').length).toBe(2);
    rt.hub.emit({ type: 'noteon', midi: 65, velocity: 0.7, timeMs: performance.now(), source: 'midi' });
    expect(audioCalls('noteOn').length).toBe(2);
  });

  it('ordnet Tasten ohne passende Note über den Split-Punkt einer Hand zu', () => {
    expect(rt.handFor(30)).toBe('left');
    expect(rt.handFor(100)).toBe('right');
  });
});

describe('Transport, Count-in und Metronom', () => {
  it('zählt vor dem Start ein und klickt dabei', () => {
    useSettings.getState().update({ countInBars: 1 });
    rt.togglePlay();
    expect(rt.live.countIn).not.toBeNull();
    expect(rt.transport.position).toBeLessThan(0);
    vi.advanceTimersByTime(3000);
    expect(audioCalls('click').length).toBe(4);
    expect(rt.live.countIn).toBeNull();
  });

  it('klickt bei eingeschaltetem Metronom auf jedem Schlag', () => {
    useSettings.getState().update({ mode: 'watch', metronome: true });
    rt.togglePlay();
    vi.advanceTimersByTime(2100);
    expect(audioCalls('click').length).toBeGreaterThanOrEqual(3);
  });

  it('springt taktweise und setzt das Tempo', () => {
    rt.seekToMeasure(3);
    expect(rt.currentMeasure()).toBe(3);
    rt.seekMeasure(1);
    expect(rt.currentMeasure()).toBe(4);
    rt.seekMeasure(-1);
    expect(rt.currentMeasure()).toBe(3);
    rt.setRate(0.5);
    expect(useApp.getState().rate).toBe(0.5);
    rt.setRate(1);
  });
});

describe('Loop', () => {
  it('wiederholt den Bereich und meldet jeden Durchgang', () => {
    useSettings.getState().update({ mode: 'watch' });
    rt.setLoop({ startMeasure: 1, endMeasure: 1 });
    const loop = rt.live.loop!;
    expect(loop.startSec).toBeCloseTo(rt.live.measures[1]!.startSec);
    expect(rt.transport.position).toBeCloseTo(loop.startSec);
    rt.togglePlay();
    vi.advanceTimersByTime((loop.endSec - loop.startSec) * 1000 + 100);
    expect(useApp.getState().lastPass?.index).toBe(1);
    expect(rt.transport.position).toBeLessThan(loop.endSec);
    expect(rt.transport.position).toBeGreaterThanOrEqual(loop.startSec);
  });

  it('schaltet mit toggleLoop vier Takte ab dem aktuellen ein und wieder aus', () => {
    rt.seekToMeasure(2);
    rt.toggleLoop();
    expect(useApp.getState().loop).toEqual({ startMeasure: 2, endMeasure: 5 });
    expect(useApp.getState().loopEnabled).toBe(true);
    rt.toggleLoop();
    expect(useApp.getState().loopEnabled).toBe(false);
    expect(rt.live.loop).toBeNull();
  });
});

describe('Spuren', () => {
  it('ändert den Split-Punkt und speichert ihn am Bibliothekseintrag', async () => {
    const song = useApp.getState().song!;
    rt.setSongSplitPoint(72);
    expect(useApp.getState().song?.splitPoint).toBe(72);
    await vi.waitFor(async () => expect((await libraryRepo.get(song.id))?.splitPoint).toBe(72));
  });

  it('benennt Stücke um', async () => {
    const id = useApp.getState().song!.id;
    await rt.renameLibrarySong(id, 'Neu');
    expect(useApp.getState().song?.title).toBe('Neu');
  });
});
