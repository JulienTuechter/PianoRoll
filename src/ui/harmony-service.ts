/**
 * Harmony Assist: verbindet Input, Tonart-Tracker, Akkorderkennung und Vorschläge mit der UI.
 * Ghost-Notes und Skalentöne liegen in `harmonyLive`, damit die Klaviatur sie pro Frame lesen kann.
 */
import { detectChord, respell } from '../core/chord-detection/chord';
import { analyzeSongChords, harmonicWindows, songHistogram } from '../core/chord-detection/song-chords';
import {
  romanFor,
  scalePcs,
  suggestNext,
  voiceChord,
  type ChordSuggestion,
  type Voicing,
} from '../core/harmony-suggestions/harmony';
import { parseKey, sameKey, speller, type MusicalKey } from '../core/key-detection/key';
import { estimateKey, KeyTracker } from '../core/key-detection/krumhansl';
import type { Song } from '../core/note-event-model/types';
import { audio, hub, live } from './runtime';
import { useApp } from './store/app-store';
import { useHarmony, type KeySource, type SuggestionChip } from './store/harmony-store';
import { useSettings } from './store/settings';

export const harmonyLive = {
  ghost: null as Voicing | null,
  scalePcs: null as ReadonlySet<number> | null,
};

const tracker = new KeyTracker(8000);
let estimated: { key: MusicalKey; confidence: number } | null = null;
/** Rechte-Hand-Töne des zuletzt gespielten Akkords – Referenz für stimmführungsnahe Voicings */
let lastUpper: number[] = [];

function effectiveKey(): { key: MusicalKey | null; source: KeySource; confidence: number } {
  const s = useSettings.getState();
  if (s.harmonyKey) return { key: s.harmonyKey, source: 'manual', confidence: 1 };
  if (estimated) return { key: estimated.key, source: 'auto', confidence: estimated.confidence };
  const songKey = useHarmony.getState().songKey;
  if (songKey) return { key: songKey, source: 'song', confidence: 1 };
  return { key: null, source: 'none', confidence: 0 };
}

function toChips(list: ChordSuggestion[]): SuggestionChip[] {
  return list.map((c) => {
    const v = voiceChord(c.rootPc, c.pcs, lastUpper);
    return { ...c, bass: v.bass, upper: v.upper };
  });
}

/**
 * Akkord, Stufe und Vorschläge neu berechnen.
 * Ein neuer Akkord wird nur nach einem Anschlag übernommen – beim Loslassen werden die Tasten nacheinander frei,
 * und die Zwischenstufen (z. B. D-F-A nach Bm7♭5) sollen nicht als „gespielter Akkord“ gelten.
 */
function recompute(afterNoteOn = false): void {
  const { key, source, confidence } = effectiveKey();
  const spell = speller(key);
  const sounding = [...new Set([...hub.pressed.keys(), ...hub.sustained])];
  const now = detectChord(sounding, spell);
  const h = useHarmony.getState();
  let chord = h.chord;
  if (now && (afterNoteOn || !chord)) {
    chord = now;
    const bass = Math.min(...sounding);
    lastUpper = sounding.filter((m) => m !== bass && m >= 55).sort((a, b) => a - b);
  } else if (chord) {
    // Schreibweise an die (evtl. neue) Tonart anpassen
    chord = respell(chord, spell);
  }
  const numeral = chord && key ? (romanFor(chord, key)?.numeral ?? null) : null;
  const suggestions = key ? toChips(suggestNext(chord, key)) : [];

  const isSounding = now !== null && now.symbol === chord?.symbol;
  const chordChanged = chord?.symbol !== h.chord?.symbol || isSounding !== h.chordSounding;
  const keyChanged =
    !sameKey(key, h.key) || source !== h.keySource || Math.abs(confidence - h.keyConfidence) > 0.05;
  const sugChanged =
    suggestions.map((x) => x.symbol + x.upper.join()).join() !==
    h.suggestions.map((x) => x.symbol + x.upper.join()).join();
  if (chordChanged || keyChanged || sugChanged || numeral !== h.chordNumeral) {
    useHarmony.getState().set({
      chord,
      chordSounding: isSounding,
      chordNumeral: numeral,
      key,
      keySource: source,
      keyConfidence: confidence,
      suggestions,
    });
  }
  updateScaleTones();
}

function updateScaleTones(): void {
  const s = useSettings.getState();
  const key = useHarmony.getState().key;
  harmonyLive.scalePcs = s.harmonyScaleTones && key ? new Set(scalePcs(key)) : null;
}

/** Tonart und Akkordfolge eines Stücks bestimmen. */
function analyzeSong(song: Song | null): void {
  if (!song) {
    useHarmony.getState().set({ songKey: null, segments: [] });
    return;
  }
  const ks = song.keySignatures[0];
  const songKey = (ks && parseKey(ks.key, ks.scale)) ?? estimateKey(songHistogram(live.notes))?.key ?? null;
  const windows = harmonicWindows(live.measures, live.beats, song.durationSec);
  const segments = analyzeSongChords(live.notes, windows, speller(songKey));
  useHarmony.getState().set({ songKey, segments });
}

export function showGhost(v: Voicing | null): void {
  harmonyLive.ghost = v;
}

/** Vorschlag anpinnen (bzw. lösen) und optional anspielen. */
export function togglePin(chip: SuggestionChip | null, id: string | null): void {
  const h = useHarmony.getState();
  if (!chip || h.pinned === id) {
    h.set({ pinned: null });
    harmonyLive.ghost = null;
    return;
  }
  h.set({ pinned: id });
  harmonyLive.ghost = { bass: chip.bass, upper: chip.upper };
  if (useSettings.getState().harmonyAudition) {
    for (const m of [chip.bass, ...chip.upper]) audio.playNote('app', m, 0.55, 0, 1.2);
  }
}

export function startHarmony(): () => void {
  let pending = false;
  let sawNoteOn = false;
  const schedule = (noteOn = false) => {
    sawNoteOn ||= noteOn;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const on = sawNoteOn;
      sawNoteOn = false;
      recompute(on);
    });
  };

  const offInput = hub.subscribe((e) => {
    if (e.type === 'noteon') tracker.noteOn(e.midi, e.timeMs, e.velocity);
    else if (e.type === 'noteoff') tracker.noteOff(e.midi, e.timeMs);
    schedule(e.type === 'noteon');
  });

  const keyTimer = setInterval(() => {
    const est = tracker.estimate(performance.now());
    const next = est ? { key: est.key, confidence: est.confidence } : null;
    if (
      !sameKey(next?.key ?? null, estimated?.key ?? null) ||
      Math.abs((next?.confidence ?? 0) - (estimated?.confidence ?? 0)) > 0.05
    ) {
      estimated = next;
      schedule();
    }
  }, 1000);

  const offSettings = useSettings.subscribe((s, prev) => {
    if (s.harmonyKey !== prev.harmonyKey || s.harmonyScaleTones !== prev.harmonyScaleTones) schedule();
  });

  const offSong = useApp.subscribe((a, prev) => {
    if (a.song !== prev.song) {
      analyzeSong(a.song);
      schedule();
    }
  });
  analyzeSong(useApp.getState().song);
  recompute();

  return () => {
    offInput();
    clearInterval(keyTimer);
    offSettings();
    offSong();
  };
}

/** Tonart-Schätzung zurücksetzen (z. B. beim Wechsel zu einem neuen Stück im Freispiel). */
export function resetKeyTracker(): void {
  tracker.reset();
  estimated = null;
  recompute();
}
