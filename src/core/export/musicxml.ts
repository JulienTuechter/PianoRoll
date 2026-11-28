import { keyFifths, type MusicalKey } from '../key-detection/key';
import type { ChordQuality } from '../chord-detection/chord';
import type { ChordLabel, NotationEvent, NotationScore, NoteValue } from '../notation-builder/notation';

const TYPE: Record<NoteValue, string> = {
  '1': 'whole',
  '2': 'half',
  '4': 'quarter',
  '8': 'eighth',
  '16': '16th',
  '32': '32nd',
};
const ACCIDENTAL: Record<string, string> = {
  '-2': 'flat-flat',
  '-1': 'flat',
  '0': 'natural',
  '1': 'sharp',
  '2': 'double-sharp',
};
/** Akkordart → MusicXML <kind> */
const KIND: Record<ChordQuality, string> = {
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  dom7: 'dominant',
  maj7: 'major-seventh',
  min7: 'minor-seventh',
  hdim7: 'half-diminished',
  dim7: 'diminished-seventh',
  sus4: 'suspended-fourth',
  sus2: 'suspended-second',
  maj6: 'major-sixth',
  min6: 'minor-sixth',
  other: 'other',
};

/** "Bb" → <root-step>B</root-step><root-alter>-1</root-alter> (bzw. bass-step/bass-alter) */
function stepAlter(name: string, prefix: 'root' | 'bass'): string {
  const step = name[0]?.toUpperCase() ?? 'C';
  const alter = [...name.slice(1)].reduce(
    (s, c) => s + (c === '#' || c === '♯' ? 1 : c === 'b' || c === '♭' ? -1 : 0),
    0,
  );
  return `<${prefix}-step>${step}</${prefix}-step>${alter ? `<${prefix}-alter>${alter}</${prefix}-alter>` : ''}`;
}

export function harmonyXml(c: ChordLabel, offset: number): string {
  const bass = c.bass && c.bass !== c.root ? `<bass>${stepAlter(c.bass, 'bass')}</bass>` : '';
  const off = offset > 0 ? `<offset>${offset}</offset>` : '';
  return `<harmony><root>${stepAlter(c.root, 'root')}</root><kind text="${escapeXml(c.suffix)}">${KIND[c.quality]}</kind>${bass}${off}<staff>1</staff></harmony>`;
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** "bb/4" → { step: "B", alter: -1, octave: 4 } */
export function parseVexKey(k: string): { step: string; alter: number; octave: number } {
  const [name = 'c', oct = '4'] = k.split('/');
  const step = name[0]!.toUpperCase();
  const alter = [...name.slice(1)].reduce((s, c) => s + (c === '#' ? 1 : c === 'b' ? -1 : 0), 0);
  return { step, alter, octave: Number(oct) };
}

/** Vorzeichen der Tonart pro Stammton */
export function keyAlters(fifths: number): Record<string, number> {
  const out: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) for (const s of SHARP_ORDER.slice(0, fifths)) out[s] = 1;
  if (fifths < 0) for (const s of FLAT_ORDER.slice(0, -fifths)) out[s] = -1;
  return out;
}

interface MusicXmlOptions {
  title: string;
  bpm: number;
  key: MusicalKey | null;
  /** Name der Stimme (Standard „Klavier“) */
  partName?: string;
}

/**
 * MusicXML 4.0 (partwise): eine Klavierstimme mit zwei Systemen, je bis zu zwei Stimmen.
 * Haltebögen, Triolen (time-modification + tuplet), Versetzungszeichen (pro Takt und System), Akkordsymbole,
 * Dynamik und Haltepedal werden gesetzt.
 */
export function toMusicXml(score: NotationScore, opts: MusicXmlOptions): string {
  const fifths = keyFifths(opts.key);
  const baseAlters = keyAlters(fifths);
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  push(
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
  );
  push('<score-partwise version="4.0">');
  push(`  <work><work-title>${escapeXml(opts.title)}</work-title></work>`);
  push('  <identification><encoding><software>Pianist</software></encoding></identification>');
  push(
    `  <part-list><score-part id="P1"><part-name>${escapeXml(opts.partName ?? 'Klavier')}</part-name></score-part></part-list>`,
  );
  push('  <part id="P1">');

  // Haltebögen: pro System Tonhöhe → Tick, an dem die gebundene Folgenote beginnt (auch über Taktgrenzen)
  const pendingTies: Record<1 | 2, Map<number, number>> = { 1: new Map(), 2: new Map() };

  score.measures.forEach((m, mi) => {
    push(`    <measure number="${mi + 1}">`);
    if (mi === 0) {
      push('      <attributes>');
      push(`        <divisions>${score.ppq}</divisions>`);
      push(`        <key><fifths>${fifths}</fifths><mode>${opts.key?.mode ?? 'major'}</mode></key>`);
      push(`        <time><beats>${m.numerator}</beats><beat-type>${m.denominator}</beat-type></time>`);
      push('        <staves>2</staves>');
      push('        <clef number="1"><sign>G</sign><line>2</line></clef>');
      push('        <clef number="2"><sign>F</sign><line>4</line></clef>');
      push('      </attributes>');
      push(
        `      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(opts.bpm)}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${Math.round(opts.bpm)}"/></direction>`,
      );
    } else if (m.timeSigChange) {
      push(
        `      <attributes><time><beats>${m.numerator}</beats><beat-type>${m.denominator}</beat-type></time></attributes>`,
      );
    }

    // Zeichen am Taktanfang (Position über <offset>)
    const offset = (tick: number) => {
      const o = tick - m.startTick;
      return o > 0 ? `<offset>${o}</offset>` : '';
    };
    for (const c of m.chords) push(`      ${harmonyXml(c, c.tick - m.startTick)}`);
    if (m.dynamic)
      push(
        `      <direction placement="below"><direction-type><dynamics><${m.dynamic}/></dynamics></direction-type><staff>1</staff></direction>`,
      );
    for (const p of score.pedals) {
      const marks: string[] = [];
      if (p.startTick >= m.startTick && p.startTick < m.endTick)
        marks.push(
          `<direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type>${offset(p.startTick)}<staff>2</staff></direction>`,
        );
      if (p.endTick > m.startTick && p.endTick <= m.endTick)
        marks.push(
          `<direction placement="below"><direction-type><pedal type="stop" line="yes"/></direction-type>${offset(p.endTick)}<staff>2</staff></direction>`,
        );
      for (const x of marks) push(`      ${x}`);
    }

    const alterState: Record<1 | 2, Map<string, number>> = { 1: new Map(), 2: new Map() }; // "B4" → Vorzeichen im Takt
    const writeVoice = (events: NotationEvent[], staff: 1 | 2, voice: number, stem: 'up' | 'down' | null) => {
      const stemEl = stem ? `<stem>${stem}</stem>` : '';
      events.forEach((e, ei) => {
        const prev = events[ei - 1];
        const next = events[ei + 1];
        const tupletStart = e.tuplet !== null && prev?.tuplet !== e.tuplet;
        const tupletStop = e.tuplet !== null && next?.tuplet !== e.tuplet;
        const typeEls = e.wholeMeasureRest ? '' : `<type>${TYPE[e.value]}</type>${'<dot/>'.repeat(e.dots)}`;
        const timeMod =
          e.tuplet !== null
            ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'
            : '';
        if (e.rest) {
          const notations = [
            tupletStart ? '<tuplet type="start" bracket="yes"/>' : '',
            tupletStop ? '<tuplet type="stop"/>' : '',
          ].join('');
          push(
            `      <note><rest${e.wholeMeasureRest ? ' measure="yes"' : ''}/><duration>${e.durationTicks}</duration><voice>${voice}</voice>${typeEls}${timeMod}<staff>${staff}</staff>${notations ? `<notations>${notations}</notations>` : ''}</note>`,
          );
          return;
        }
        const ties = pendingTies[staff];
        const endTick = e.startTick + e.durationTicks;
        e.keys.forEach((k, ki) => {
          const midi = e.midis[ki]!;
          const p = parseVexKey(k);
          const stop = ties.get(midi) === e.startTick;
          if (stop) ties.delete(midi);
          const start = e.tieNext;
          if (start) ties.set(midi, endTick);
          const stateKey = `${p.step}${p.octave}`;
          const current = alterState[staff].get(stateKey) ?? baseAlters[p.step] ?? 0;
          let acc = '';
          if (p.alter !== current && !stop)
            acc = `<accidental>${ACCIDENTAL[String(p.alter)] ?? 'natural'}</accidental>`;
          alterState[staff].set(stateKey, p.alter);
          const pitch = `<pitch><step>${p.step}</step>${p.alter !== 0 ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`;
          const tieEls = `${stop ? '<tie type="stop"/>' : ''}${start ? '<tie type="start"/>' : ''}`;
          const notations = [
            stop ? '<tied type="stop"/>' : '',
            start ? '<tied type="start"/>' : '',
            ki === 0 && tupletStart ? '<tuplet type="start" bracket="yes"/>' : '',
            ki === 0 && tupletStop ? '<tuplet type="stop"/>' : '',
          ].join('');
          push(
            `      <note>${ki > 0 ? '<chord/>' : ''}${pitch}<duration>${e.durationTicks}</duration>${tieEls}<voice>${voice}</voice>${typeEls}${acc}${timeMod}${stemEl}<staff>${staff}</staff>${notations ? `<notations>${notations}</notations>` : ''}</note>`,
          );
        });
      });
    };

    const length = m.endTick - m.startTick;
    type Part = [NotationEvent[], 1 | 2, number, 'up' | 'down' | null];
    const parts: Part[] = [[m.treble, 1, 1, m.treble2.length ? 'up' : null]];
    if (m.treble2.length) parts.push([m.treble2, 1, 2, 'down']);
    parts.push([m.bass, 2, 5, m.bass2.length ? 'up' : null]);
    if (m.bass2.length) parts.push([m.bass2, 2, 6, 'down']);
    parts.forEach(([events, staff, voice, stem], pi) => {
      if (pi > 0) push(`      <backup><duration>${length}</duration></backup>`);
      writeVoice(events, staff, voice, stem);
    });
    if (mi === score.measures.length - 1)
      push('      <barline location="right"><bar-style>light-heavy</bar-style></barline>');
    push('    </measure>');
  });

  push('  </part>');
  push('</score-partwise>');
  return lines.join('\n');
}
