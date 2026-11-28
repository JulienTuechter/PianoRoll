import { Midi } from '@tonejs/midi';
import { keyTonicName, parseKey } from '../key-detection/key';
import { mergePedalSpans, pedalSpans } from '../note-event-model/pedal';
import { TempoMap } from '../note-event-model/tempo-map';
import type {
  KeySignatureChange,
  NoteEvent,
  Song,
  TimeSignatureChange,
  TrackInfo,
} from '../note-event-model/types';
import { MIDDLE_C } from '../note-event-model/types';
import { applyHands, assignHands, type TrackSummary } from './hands';
import { hashBytes } from './hash';

/** Grund des Ladefehlers; die Oberfläche übersetzt ihn (die Meldung bleibt für Logs auf Deutsch). */
export type MidiFileErrorCode = 'invalid' | 'empty';

export class MidiFileError extends Error {
  override name = 'MidiFileError';
  constructor(
    message: string,
    readonly code: MidiFileErrorCode,
    readonly detail?: string,
  ) {
    super(message);
  }
}

export interface LoadOptions {
  title?: string;
  splitPoint?: number;
}

/** Parst eine Standard-MIDI-Datei in das interne Song-Modell. */
export function loadMidiFile(data: ArrayBuffer | Uint8Array, options: LoadOptions = {}): Song {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new MidiFileError(`Die Datei ist keine gültige MIDI-Datei (${detail})`, 'invalid', detail);
  }

  const ppq = midi.header.ppq;
  const tempoMap = new TempoMap(
    ppq,
    midi.header.tempos.map((t) => ({ tick: t.ticks, bpm: t.bpm })),
  );

  // Taktart-Wechsel inkl. Taktindex
  const timeSignatures: TimeSignatureChange[] = [];
  {
    const sigs = [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks);
    let measure = 0;
    let lastTick = 0;
    let last = { numerator: 4, denominator: 4 };
    for (const s of sigs) {
      const [num = 4, den = 4] = s.timeSignature;
      const measureLen = ppq * last.numerator * (4 / last.denominator);
      measure += Math.round((s.ticks - lastTick) / measureLen);
      if (timeSignatures.length > 0 && timeSignatures[timeSignatures.length - 1]?.tick === s.ticks)
        timeSignatures.pop();
      timeSignatures.push({ tick: s.ticks, numerator: num, denominator: den, measure });
      lastTick = s.ticks;
      last = { numerator: num, denominator: den };
    }
    if (timeSignatures.length === 0 || timeSignatures[0]!.tick > 0) {
      timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4, measure: 0 });
    }
  }

  // Ungültige Vorzeichenangaben (key undefined) werden verworfen
  const keySignatures: KeySignatureChange[] = midi.header.keySignatures
    .filter((k) => typeof k.key === 'string' && k.key.length > 0)
    .map((k) => {
      // @tonejs/midi liefert bei Moll den Namen der Dur-Paralleltonart (d-Moll → "F" + minor) → Moll-Tonika bestimmen
      if (k.scale !== 'minor') return { tick: k.ticks, key: k.key, scale: 'major' as const };
      const major = parseKey(k.key, 'major');
      const minor = major ? { tonicPc: (major.tonicPc + 9) % 12, mode: 'minor' as const } : null;
      return { tick: k.ticks, key: minor ? keyTonicName(minor) : k.key, scale: 'minor' as const };
    });

  const summaries: TrackSummary[] = midi.tracks.map((t, index) => ({
    index,
    name: t.name,
    program: t.instrument.number ?? -1,
    isPercussion: t.instrument.percussion || t.channel === 9,
    noteCount: t.notes.length,
    averagePitch: t.notes.length ? t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length : 0,
  }));
  const assignment = assignHands(summaries);

  const tracks: TrackInfo[] = summaries.map((s) => {
    const a = assignment.get(s.index) ?? { hand: 'split' as const, enabled: false };
    const track = midi.tracks[s.index];
    return {
      index: s.index,
      name: s.name || `Track ${s.index + 1}`,
      instrument: track?.instrument.name ?? '',
      program: s.program,
      isPercussion: s.isPercussion,
      noteCount: s.noteCount,
      handAssignment: a.hand,
      enabled: a.enabled,
    };
  });

  const rawNotes: NoteEvent[] = [];
  midi.tracks.forEach((t, trackIndex) => {
    t.notes.forEach((n, i) => {
      const startSec = tempoMap.tickToSec(n.ticks);
      const endSec = tempoMap.tickToSec(n.ticks + n.durationTicks);
      rawNotes.push({
        id: `${trackIndex}-${i}`,
        midi: n.midi,
        startTick: n.ticks,
        durationTicks: n.durationTicks,
        startSec,
        durationSec: Math.max(0.01, endSec - startSec),
        velocity: n.velocity,
        hand: 'right',
        track: trackIndex,
      });
    });
  });

  const splitPoint = options.splitPoint ?? MIDDLE_C;
  const notes = applyHands(rawNotes, tracks, splitPoint).sort(
    (a, b) => a.startSec - b.startSec || a.midi - b.midi || a.track - b.track,
  );
  if (notes.length === 0) throw new MidiFileError('Die MIDI-Datei enthält keine Noten.', 'empty');

  const durationSec = notes.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0);

  // Haltepedal aller nicht-perkussiven Spuren (CC 64, Wert 0..1; ab der Hälfte gilt es als gedrückt)
  const endTick = tempoMap.secToTick(durationSec);
  const pedals = mergePedalSpans(
    midi.tracks
      .filter((_, i) => !summaries[i]?.isPercussion)
      .map((t) =>
        pedalSpans(
          (t.controlChanges[64] ?? []).map((c) => ({ tick: c.ticks, down: c.value >= 0.5 })),
          endTick,
        ),
      ),
  );

  return {
    id: hashBytes(bytes),
    title: options.title ?? (midi.name || 'Unbenannt'),
    durationSec,
    ppq,
    tempos: [...tempoMap.changes],
    timeSignatures,
    keySignatures,
    tracks,
    notes,
    splitPoint,
    ...(pedals.length ? { pedals } : {}),
  };
}

/** Wendet geänderte Track-Zuordnung / Split-Punkt an. Deaktivierte Tracks behalten ihre Noten im Song. */
export function reassignHands(song: Song, tracks: TrackInfo[], splitPoint: number): Song {
  return { ...song, tracks, splitPoint, notes: applyHands(song.notes, tracks, splitPoint) };
}

/** Noten der aktivierten Tracks. */
export function playableNotes(song: Song): NoteEvent[] {
  return song.notes.filter((n) => song.tracks[n.track]?.enabled !== false);
}

export function titleFromFileName(name: string): string {
  return (
    name
      .replace(/\.(mid|midi)$/i, '')
      .replace(/[_]+/g, ' ')
      .trim() || 'Unbenannt'
  );
}
