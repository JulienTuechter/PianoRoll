/**
 * Eckdaten eines Stücks aus der MIDI-Datei (über den Loader der App, also @tonejs/midi) –
 * Felder aus catalog.json haben Vorrang.
 */
import { loadMidiFile, playableNotes } from '../../src/core/midi-file-loader/load';
import { estimateKey } from '../../src/core/key-detection/krumhansl';
import { keyTonicName, keyUsesFlats, pc, pcName, type MusicalKey } from '../../src/core/key-detection/key';
import type { Locale } from '../../src/i18n/locale';
import type { CatalogEntry, Hands, KeySource, PieceStats, RollNote } from './types';

export function analyzeMidi(bytes: Uint8Array): { stats: PieceStats; roll: RollNote[] } {
  const song = loadMidiFile(bytes);
  const notes = playableNotes(song);
  if (notes.length === 0) throw new Error('keine spielbaren Noten (alle Spuren deaktiviert)');

  const tempos = song.tempos.length ? song.tempos.map((t) => t.bpm) : [120];
  const tempoBpm = Math.round(tempos[0]!);
  const minT = Math.round(Math.min(...tempos));
  const maxT = Math.round(Math.max(...tempos));

  const ts = song.timeSignatures;
  const first = ts[0]!;
  const timeSignatureChanges = ts.some(
    (t) => t.numerator !== first.numerator || t.denominator !== first.denominator,
  );

  let key: PieceStats['key'] = null;
  const sig = song.keySignatures[0];
  if (sig) {
    const k = keyFromName(sig.key, sig.scale);
    if (k) key = { ...k, source: 'file' };
  }
  if (!key) {
    const hist = new Array<number>(12).fill(0);
    for (const n of notes) hist[pc(n.midi)]! += n.durationSec;
    const est = estimateKey(hist);
    if (est) key = { ...est.key, source: 'estimated' };
  }

  let notesLeft = 0;
  let lowest = 127;
  let highest = 0;
  let endTick = 0;
  let endSec = 0;
  for (const n of notes) {
    if (n.hand === 'left') notesLeft++;
    lowest = Math.min(lowest, n.midi);
    highest = Math.max(highest, n.midi);
    endTick = Math.max(endTick, n.startTick + (n.durationTicks ?? 0));
    endSec = Math.max(endSec, n.startSec + n.durationSec);
  }
  const notesRight = notes.length - notesLeft;
  const hands: Hands = notesLeft && notesRight ? 'both' : notesLeft ? 'left' : 'right';

  // Takte: letzte Taktart vor dem Ende + angefangene Takte (kleine Toleranz für Ausklang)
  const lastSig = [...ts].reverse().find((t) => t.tick <= endTick) ?? first;
  const measureTicks = song.ppq * lastSig.numerator * (4 / lastSig.denominator);
  const bars = lastSig.measure + Math.max(1, Math.ceil((endTick - lastSig.tick) / measureTicks - 0.05));

  return {
    stats: {
      durationSec: Math.round(endSec),
      tempoBpm,
      tempoRange: minT !== maxT ? [minT, maxT] : null,
      timeSignature: `${first.numerator}/${first.denominator}`,
      timeSignatureChanges,
      key,
      notes: notes.length,
      notesRight,
      notesLeft,
      hands,
      lowest,
      highest,
      bars,
    },
    roll: notes.map((n) => ({
      start: n.startSec,
      dur: n.durationSec,
      midi: n.midi,
      left: n.hand === 'left',
    })),
  };
}

/** Werte aus catalog.json übernehmen (Vorrang vor der Analyse) */
export function applyOverrides(
  stats: PieceStats,
  e: CatalogEntry,
): { stats: PieceStats; problems: string[] } {
  const problems: string[] = [];
  const s = { ...stats };
  if (e.duration_sec !== undefined) s.durationSec = Math.round(e.duration_sec);
  if (e.tempo_bpm !== undefined) {
    s.tempoBpm = Math.round(e.tempo_bpm);
    s.tempoRange = null;
  }
  if (e.time_signature !== undefined) {
    if (/^\d+\/\d+$/.test(e.time_signature)) {
      s.timeSignature = e.time_signature;
      s.timeSignatureChanges = false;
    } else problems.push(`time_signature „${e.time_signature}“ (erwartet z. B. „3/4“)`);
  }
  if (e.key !== undefined) {
    const k = parseKeyText(e.key);
    if (k) s.key = { ...k, source: 'catalog' as KeySource };
    else problems.push(`key „${e.key}“ (erwartet z. B. „G major“, „E minor“, „G-Dur“, „e-Moll“)`);
  }
  if (e.notes !== undefined) s.notes = e.notes;
  if (e.bars !== undefined) s.bars = e.bars;
  if (e.hands !== undefined) s.hands = e.hands;
  if (e.range !== undefined) {
    const m = /^([A-G][#b]?-?\d)\s*[-–]\s*([A-G][#b]?-?\d)$/.exec(e.range.trim());
    const lo = m && noteFromName(m[1]!);
    const hi = m && noteFromName(m[2]!);
    if (lo != null && hi != null) {
      s.lowest = lo;
      s.highest = hi;
    } else problems.push(`range „${e.range}“ (erwartet z. B. „C3-G5“)`);
  }
  return { stats: s, problems };
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

function keyFromName(name: string, scale: string): MusicalKey | null {
  return parseKeyText(`${name} ${scale}`);
}

/** „G major“, „Bb minor“, „F# major“, „G-Dur“, „e-Moll“, „fis-Moll“, „Es-Dur“ → MusicalKey */
export function parseKeyText(text: string): MusicalKey | null {
  const t = text.trim();
  const en = /^([A-Ga-g])([#b♯♭]?)[\s-]*(major|minor|maj|min)$/i.exec(t);
  if (en) {
    const base = PC[en[1]!.toUpperCase()]!;
    const acc = en[2] === '#' || en[2] === '♯' ? 1 : en[2] ? -1 : 0;
    return { tonicPc: pc(base + acc), mode: /^min/i.test(en[3]!) ? 'minor' : 'major' };
  }
  const de = /^([A-Ha-h])(is|es|s)?-?(Dur|Moll)$/i.exec(t);
  if (de) {
    const letter = de[1]!.toUpperCase();
    // Deutsch: B = Hes = B♭, H = B
    let base = letter === 'B' ? 10 : PC[letter]!;
    if (de[2] === 'is') base += 1;
    else if (de[2]) base -= 1;
    return { tonicPc: pc(base), mode: /moll/i.test(de[3]!) ? 'minor' : 'major' };
  }
  return null;
}

function noteFromName(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return (Number(m[3]) + 1) * 12 + PC[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** Englischer Tonname → deutscher: Bb → B, B → H, Eb → Es, F# → Fis */
function germanPitch(name: string): string {
  const letter = name[0]!;
  const acc = name.slice(1);
  if (letter === 'B') return acc === 'b' ? 'B' : acc === '#' ? 'His' : 'H';
  if (acc === '#') return `${letter}is`;
  if (acc === 'b') return letter === 'E' ? 'Es' : letter === 'A' ? 'As' : `${letter}es`;
  return letter;
}

/** „G major“ / „G-Dur“, „E minor“ / „e-Moll“ */
export function keyName(k: MusicalKey, locale: Locale): string {
  const tonic = keyTonicName(k);
  if (locale === 'de') {
    const g = germanPitch(tonic);
    return k.mode === 'major' ? `${g}-Dur` : `${g.toLowerCase()}-Moll`;
  }
  return `${tonic.replace('b', '♭').replace('#', '♯')} ${k.mode}`;
}

/** Notenname mit Oktave (C4 = eingestrichenes c), Schreibweise passend zur Tonart */
export function noteName(midi: number, key: MusicalKey | null, locale: Locale): string {
  const name = pcName(midi, keyUsesFlats(key));
  const octave = Math.floor(midi / 12) - 1;
  return `${locale === 'de' ? germanPitch(name) : name.replace('b', '♭').replace('#', '♯')}${octave}`;
}

/** Schema.org musicalKey: „G major“, „E minor“ (englisch, ohne Sonderzeichen) */
export function schemaKey(k: MusicalKey): string {
  return `${keyTonicName(k)} ${k.mode}`;
}

/** „1:05“ */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** ISO-8601-Dauer für JSON-LD: PT1M5S */
export function isoDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `PT${m ? `${m}M` : ''}${s % 60 || !m ? `${s % 60}S` : ''}`;
}
