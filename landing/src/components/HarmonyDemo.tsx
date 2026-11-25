import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCopy, useLang } from '../i18n';
import { useKeyboardInput } from '../input';
import { useIsoLayoutEffect } from '../hooks';
import { sound, wakeSound } from '../audio';
import { keyboardFrame } from '../stage';
import { Keys } from './Keys';
import { detectChord, type DetectedChord } from '../../../src/core/chord-detection/chord';
import { speller, type MusicalKey } from '../../../src/core/key-detection/key';
import { estimateKey } from '../../../src/core/key-detection/krumhansl';
import {
  romanFor,
  scalePcs,
  suggestNext,
  voiceChord,
  type ChordSuggestion,
} from '../../../src/core/harmony-suggestions/harmony';
import { chordDescription, keyName } from '../../../src/i18n/music';
import { messagesFor } from '../../../src/i18n';

const MIN = 36;
const MAX = 83;
const C_MAJOR: MusicalKey = { tonicPc: 0, mode: 'major' };

/** I – vi – IV – V in C, als Einstieg */
const PRESET: number[][] = [
  [36, 60, 64, 67],
  [45, 60, 64, 69],
  [41, 60, 65, 69],
  [43, 59, 62, 67],
];

interface TrailItem {
  symbol: string;
  numeral: string | null;
}

const pretty = (s: string) => s.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');

/** Harmony Assist zum Anfassen: Akkord-, Tonart-Erkennung und Folgeakkorde aus dem Kern der App. */
export function HarmonyDemo() {
  const c = useCopy();
  const lang = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const [latched, setLatched] = useState<Set<number>>(() => new Set());
  const [momentary, setMomentary] = useState<Set<number>>(() => new Set());
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [hist, setHist] = useState<number[]>(() => new Array(12).fill(0));
  const timers = useRef<number[]>([]);

  const held = useMemo(() => new Set([...latched, ...momentary]), [latched, momentary]);
  const est = useMemo(() => estimateKey(hist), [hist]);
  // erst nach ein paar Akkorden der Schätzung trauen, vorher C-Dur
  const key = est && trail.length >= 2 ? est.key : C_MAJOR;
  const spell = speller(key);
  const chord: DetectedChord | null = useMemo(() => detectChord(held, spell), [held, spell]);
  const roman = chord ? romanFor(chord, key) : null;
  const next = useMemo(() => suggestNext(chord, key, 4), [chord, key]);
  const msgs = messagesFor(lang);

  // Neuen Akkord in die Folge übernehmen (kurz stabil, damit Zwischenstufen beim Klicken nicht zählen)
  const lastSymbol = trail[trail.length - 1]?.symbol;
  useEffect(() => {
    if (!chord || chord.symbol === lastSymbol) return;
    const t = window.setTimeout(() => {
      setTrail((tr) => [...tr.slice(-7), { symbol: chord.symbol, numeral: roman?.numeral ?? null }]);
      setHist((h) => h.map((v, i) => v + (chord.pcs.includes(i) ? (i === chord.rootPc ? 2 : 1) : 0)));
    }, 450);
    return () => window.clearTimeout(t);
  }, [chord, roman, lastSymbol]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const setChord = (notes: number[]) => {
    wakeSound();
    setLatched(new Set(notes));
    notes.forEach((m, i) => sound.play(m, i === 0 ? 0.55 : 0.5, 1.6, i * 0.018));
  };

  const playSuggestion = (s: ChordSuggestion) => {
    const upper = [...held].filter((m) => m >= 55);
    const v = voiceChord(s.rootPc, s.pcs, upper.length ? upper : undefined);
    setChord([v.bass, ...v.upper]);
  };

  const playPreset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = PRESET.map((notes, i) => window.setTimeout(() => setChord(notes), i * 900));
  };

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setLatched(new Set());
    setTrail([]);
    setHist(new Array(12).fill(0));
  };

  const toggle = useCallback((midi: number, velocity: number) => {
    setLatched((s) => {
      const n = new Set(s);
      if (n.has(midi)) n.delete(midi);
      else {
        n.add(midi);
        sound.play(midi, velocity, 1.2);
      }
      return n;
    });
  }, []);

  useKeyboardInput(sectionRef, {
    octave: 4,
    noteOn: (m, v) => {
      wakeSound();
      sound.on(m, v);
      setMomentary((s) => new Set(s).add(m));
    },
    noteOff: (m) => {
      sound.off(m);
      setMomentary((s) => {
        const n = new Set(s);
        n.delete(m);
        return n;
      });
    },
  });

  const ghost = next[0]
    ? voiceChord(
        next[0].rootPc,
        next[0].pcs,
        [...held].filter((m) => m >= 55),
      )
    : null;
  const scale = useMemo(() => new Set(scalePcs(key)), [key]);
  const heldRef = useRef(held);
  const ghostRef = useRef(ghost);
  const scaleRef = useRef(scale);
  useIsoLayoutEffect(() => {
    heldRef.current = held;
    ghostRef.current = ghost;
    scaleRef.current = scale;
  });

  const frame = useCallback(
    (now: number) =>
      keyboardFrame(now, {
        pressed: new Map([...heldRef.current].map((m) => [m, true])),
        ghost: heldRef.current.size >= 3 ? ghostRef.current : null,
        ghostSoft: true,
        scalePcs: scaleRef.current,
      }),
    [],
  );

  return (
    <section className="demo harmony" id="harmony" ref={sectionRef}>
      <div className="demo-head">
        <p className="kicker">{c.harmony.kicker}</p>
        <h2>{c.harmony.title}</h2>
        <p className="lead">{c.harmony.lead}</p>
      </div>
      <div className="demo-stage harmony-stage">
        <div className="harmony-grid">
          <div className="now-chord" aria-live="polite">
            <p className="label">{c.harmony.playing}</p>
            <p className={`symbol ${chord ? 'lit' : ''}`} key={chord?.symbol ?? 'none'}>
              {chord ? pretty(chord.symbol) : '—'}
            </p>
            <p className="desc">{chord ? chordDescription(chord, msgs) : c.harmony.none}</p>
            <div className="key-row">
              <span>
                {c.harmony.key}: <b>{keyName(key, msgs)}</b>
              </span>
              {roman && (
                <span className={`fn ${roman.fn}`}>
                  {roman.numeral} · {c.harmony.fn[roman.fn]}
                </span>
              )}
            </div>
          </div>
          <div className="next">
            <p className="label">{c.harmony.next}</p>
            <ul>
              {next.map((s, i) => (
                <li key={s.numeral}>
                  <button type="button" onClick={() => playSuggestion(s)} className={i === 0 ? 'top' : ''}>
                    <span className="numeral">{s.numeral}</span>
                    <span className="sym">{pretty(s.symbol)}</span>
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${Math.round(s.probability * 100)}%` }} />
                    </span>
                    <span className="prob">{Math.round(s.probability * 100)} %</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Keys
          min={MIN}
          max={MAX}
          frame={frame}
          onDown={toggle}
          label={c.harmony.latch}
          className="harmony-keys"
        />
        <div className="trail-row">
          <div className="trail" aria-label={c.harmony.trail}>
            {trail.length === 0 ? (
              <button type="button" className="ghost-link" onClick={playPreset}>
                ▶ C – Am – F – G
              </button>
            ) : (
              trail.map((t, i) => (
                <span key={i} className="chip">
                  <b>{pretty(t.symbol)}</b>
                  {t.numeral && <small>{t.numeral}</small>}
                </span>
              ))
            )}
          </div>
          <button type="button" className="text-btn" onClick={clear}>
            {c.harmony.clear}
          </button>
        </div>
        <p className="demo-foot">{c.harmony.latch}</p>
      </div>
    </section>
  );
}
