import { useMemo, useRef, useState } from 'react';
import { useCopy } from '../i18n';
import { sound, wakeSound } from '../audio';
import { demoSong } from '../stage';
import { quantize } from '../../../src/core/quantizer/quantizer';
import type { Recording } from '../../../src/core/recorder/recorder';
import { writeMidi } from '../../../src/core/export/midi-writer';
import { isBlackKey, midiToName } from '../../../src/core/note-event-model/notes';
import { handColors } from '../../../src/ui/theme';

const BARS = 4;

/** Eine „locker“ gespielte Aufnahme der ersten Takte des Demo-Stücks (Timing und Längen zufällig verschoben). */
function humanize(seed: number): Recording {
  const d = demoSong();
  const bpm = d.tempoMap.bpmAtTick(0);
  const end = d.measures[BARS]?.startSec ?? 12;
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const jitter = () => (rand() + rand() + rand() - 1.5) * 95; // grob normalverteilt, ±140 ms
  const notes = d.notes
    .filter((n) => n.startSec < end - 0.01)
    .map((n) => {
      const start = Math.max(0, n.startSec * 1000 + jitter());
      return {
        midi: n.midi,
        startMs: start,
        endMs: start + n.durationSec * 1000 * (0.62 + rand() * 0.42),
        velocity: 0.45 + rand() * 0.4,
      };
    });
  return {
    bpm,
    numerator: 4,
    denominator: 4,
    startedAt: Date.now(),
    durationMs: end * 1000,
    notes,
    pedal: [],
  };
}

type Grid = 4 | 8 | 16;

/** Aufnehmen & Quantisieren: der Quantizer und der MIDI-Writer der App an einer „locker“ gespielten Aufnahme. */
export function QuantizeDemo() {
  const c = useCopy();
  const [seed, setSeed] = useState(7);
  const [grid, setGrid] = useState<Grid>(8);
  const [clean, setClean] = useState(false);
  const timers = useRef<number[]>([]);

  const rec = useMemo(() => humanize(seed), [seed]);
  const q = useMemo(() => quantize(rec, { grid, splitPoint: 60 }), [rec, grid]);
  const ticksPerMs = (q.ppq * rec.bpm) / 60000;
  const totalTicks = q.measureTicks * BARS;

  // Jede gespielte Note ihrer quantisierten Fassung zuordnen (gleiche Tonhöhe, nächster Anschlag)
  const bars = useMemo(() => {
    const used = new Set<number>();
    return rec.notes.map((n, i) => {
      const rawStart = n.startMs * ticksPerMs;
      let best = -1;
      q.notes.forEach((qn, j) => {
        if (used.has(j) || qn.midi !== n.midi) return;
        if (best < 0 || Math.abs(qn.startTick - rawStart) < Math.abs(q.notes[best]!.startTick - rawStart))
          best = j;
      });
      if (best >= 0) used.add(best);
      const qn = best >= 0 ? q.notes[best] : undefined;
      return {
        id: i,
        midi: n.midi,
        raw: { start: rawStart, len: (n.endMs - n.startMs) * ticksPerMs },
        clean: qn ? { start: qn.startTick, len: qn.durationTicks ?? 0 } : null,
        hand: n.midi < 60 ? 'left' : 'right',
        offMs: qn ? n.startMs - qn.startTick / ticksPerMs : 0,
      };
    });
  }, [rec, q, ticksPerMs]);

  const lo = Math.min(...rec.notes.map((n) => n.midi)) - 1;
  const hi = Math.max(...rec.notes.map((n) => n.midi)) + 1;
  const rows = hi - lo + 1;

  const listen = () => {
    wakeSound();
    timers.current.forEach((t) => window.clearTimeout(t));
    sound.stopAll();
    for (const b of bars) {
      const span = clean && b.clean ? b.clean : b.raw;
      const vel = rec.notes[b.id]!.velocity;
      sound.play(b.midi, vel, span.len / ticksPerMs / 1000, span.start / ticksPerMs / 1000 + 0.05);
    }
  };

  const download = () => {
    const bytes = writeMidi({
      ppq: q.ppq,
      bpm: q.bpm,
      numerator: q.numerator,
      denominator: q.denominator,
      key: { tonicPc: 0, mode: 'major' },
      title: 'Pianist demo take',
      tracks: (['right', 'left'] as const).map((hand, i) => ({
        name: hand === 'right' ? 'Right hand' : 'Left hand',
        channel: i,
        notes: q.notes
          .filter((n) => n.hand === hand)
          .map((n) => ({
            midi: n.midi,
            startTick: n.startTick,
            durationTicks: n.durationTicks ?? 0,
            velocity: n.velocity,
          })),
      })),
    });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pianist-take.mid';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const step = (q.ppq * 4) / grid;
  const avgOff = Math.round(bars.reduce((s, b) => s + Math.abs(b.offMs), 0) / Math.max(1, bars.length));

  return (
    <section className="demo quant" id="record">
      <div className="demo-head">
        <p className="kicker">{c.quant.kicker}</p>
        <h2>{c.quant.title}</h2>
        <p className="lead">{c.quant.lead}</p>
      </div>
      <div className="demo-stage">
        <div className="demo-bar">
          <div className="seg" role="group">
            <button type="button" aria-pressed={!clean} onClick={() => setClean(false)}>
              {c.quant.loose}
            </button>
            <button type="button" aria-pressed={clean} onClick={() => setClean(true)}>
              {c.quant.clean}
            </button>
          </div>
          <div className="seg small" role="group" aria-label={c.quant.grid}>
            <span className="seg-label">{c.quant.grid}</span>
            {([4, 8, 16] as const).map((g) => (
              <button key={g} type="button" aria-pressed={grid === g} onClick={() => setGrid(g)}>
                1/{g}
              </button>
            ))}
          </div>
          <span className={`pill ${clean ? 'on good' : ''}`}>{clean ? '± 0 ms' : `⌀ ± ${avgOff} ms`}</span>
        </div>
        <div
          className={`roll ${clean ? 'is-clean' : ''}`}
          style={
            {
              '--rows': rows,
              '--steps': totalTicks / step,
              '--beats': totalTicks / q.ppq,
              '--bars': BARS,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: rows }, (_, i) => {
            const m = hi - i;
            return (
              <div
                key={m}
                className={`roll-row ${isBlackKey(m) ? 'black' : ''}`}
                style={{ top: `${(i / rows) * 100}%` }}
              >
                {m % 12 === 0 && <span>{midiToName(m)}</span>}
              </div>
            );
          })}
          <div className="roll-grid" />
          {bars.map((b) => {
            const span = clean && b.clean ? b.clean : b.raw;
            const color = b.hand === 'right' ? handColors.right : handColors.left;
            return (
              <div key={`${seed}-${b.id}`} className="roll-note-wrap">
                {/* Geisterbild der gespielten Lage bleibt im quantisierten Zustand sichtbar */}
                <span
                  className="roll-ghost"
                  style={{
                    left: `${(b.raw.start / totalTicks) * 100}%`,
                    width: `${(b.raw.len / totalTicks) * 100}%`,
                    top: `${((hi - b.midi) / rows) * 100}%`,
                    height: `${100 / rows}%`,
                    borderColor: color,
                  }}
                />
                <span
                  className="roll-note"
                  style={{
                    left: `${(span.start / totalTicks) * 100}%`,
                    width: `${(Math.max(span.len, 20) / totalTicks) * 100}%`,
                    top: `${((hi - b.midi) / rows) * 100}%`,
                    height: `${100 / rows}%`,
                    background: color,
                    boxShadow: `0 0 14px ${color}`,
                    transitionDelay: `${(b.raw.start / totalTicks) * 260}ms`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="demo-bar bottom">
          <button type="button" className="text-btn" onClick={listen}>
            ▶ {c.quant.listen}
          </button>
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setSeed((s) => (s * 48271) % 2147483647);
              setClean(false);
            }}
          >
            ↻ {c.quant.shuffle}
          </button>
          <span className="spacer" />
          <span className="formats">{c.quant.formats}</span>
          <button type="button" className="cta small" onClick={download}>
            ↓ {c.quant.midi}
          </button>
        </div>
      </div>
    </section>
  );
}
