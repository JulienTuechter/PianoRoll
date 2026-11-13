import { keyFifths, type MusicalKey } from '../key-detection/key';

export interface MidiExportNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  /** 0..1 */
  velocity: number;
}

export interface MidiExportTrack {
  name: string;
  channel: number;
  notes: MidiExportNote[];
  pedal?: { tick: number; down: boolean }[];
}

export interface MidiExport {
  ppq: number;
  bpm: number;
  numerator: number;
  denominator: number;
  key: MusicalKey | null;
  title: string;
  tracks: MidiExportTrack[];
}

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function text(meta: number, s: string): number[] {
  const bytes = [...new TextEncoder().encode(s)];
  return [0xff, meta, ...vlq(bytes.length), ...bytes];
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  return [...[...type].map((c) => c.charCodeAt(0)), ...u32(data.length), ...data];
}

interface TimedEvent {
  tick: number;
  /** Reihenfolge bei gleichem Tick: Note-Off (0) vor Controller (1) vor Note-On (2) */
  order: number;
  bytes: number[];
}

function encodeTrack(events: TimedEvent[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  out.push(0, 0xff, 0x2f, 0x00); // End of Track
  return out;
}

/**
 * Schreibt eine Standard-MIDI-Datei (Typ 1). Eigene Implementierung, weil der Encoder von @tonejs/midi
 * Tonarten falsch kodiert. Spur 0 enthält Titel, Tempo, Taktart und Tonart.
 */
export function writeMidi(e: MidiExport): Uint8Array<ArrayBuffer> {
  const usPerQuarter = Math.round(60_000_000 / e.bpm);
  const conductor: TimedEvent[] = [
    { tick: 0, order: 1, bytes: text(0x03, e.title) },
    {
      tick: 0,
      order: 1,
      bytes: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff],
    },
    {
      tick: 0,
      order: 1,
      bytes: [0xff, 0x58, 0x04, e.numerator, Math.round(Math.log2(e.denominator)), 24, 8],
    },
    {
      tick: 0,
      order: 1,
      bytes: [0xff, 0x59, 0x02, keyFifths(e.key) & 0xff, e.key?.mode === 'minor' ? 1 : 0],
    },
  ];
  const tracks = [encodeTrack(conductor)];
  for (const t of e.tracks) {
    const ch = t.channel & 0x0f;
    const evs: TimedEvent[] = [{ tick: 0, order: 1, bytes: text(0x03, t.name) }];
    for (const n of t.notes) {
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
      evs.push({ tick: n.startTick, order: 2, bytes: [0x90 | ch, n.midi & 0x7f, vel] });
      evs.push({
        tick: n.startTick + Math.max(1, n.durationTicks),
        order: 0,
        bytes: [0x80 | ch, n.midi & 0x7f, 0],
      });
    }
    for (const p of t.pedal ?? [])
      evs.push({ tick: p.tick, order: 1, bytes: [0xb0 | ch, 64, p.down ? 127 : 0] });
    tracks.push(encodeTrack(evs));
  }
  const header = chunk('MThd', [0, 1, 0, tracks.length, (e.ppq >> 8) & 0xff, e.ppq & 0xff]);
  return new Uint8Array([...header, ...tracks.flatMap((t) => chunk('MTrk', t))]);
}
