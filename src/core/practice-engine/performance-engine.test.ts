import { describe, expect, it } from 'vitest';
import { InputHub } from '../midi-input/input-hub';
import { MockMidiInput } from '../midi-input/mock-input';
import type { Hand, NoteEvent } from '../note-event-model/types';
import { Transport } from '../playback/transport';
import { FakeClock } from '../time/clock';
import type { EngineEvent } from './engine-types';
import { PerformanceEngine, type PerformanceConfig } from './performance-engine';

let id = 0;
function n(midi: number, startSec: number, hand: Hand = 'right'): NoteEvent {
  return { id: String(id++), midi, startTick: 0, startSec, durationSec: 0.3, velocity: 0.8, hand, track: 0 };
}

const baseConfig: PerformanceConfig = {
  hands: 'both',
  perfectMs: 50,
  goodMs: 120,
  catchMs: 250,
  latencyMs: 0,
};

function setup(notes: NoteEvent[], config: Partial<PerformanceConfig> = {}, duration = 5) {
  const clock = new FakeClock(0);
  const transport = new Transport(clock, duration);
  const hub = new InputHub();
  const engine = new PerformanceEngine(transport, clock, notes, { ...baseConfig, ...config }, [
    { index: 0, startSec: 0, startTick: 0, numerator: 4, denominator: 4 },
    { index: 1, startSec: 2, startTick: 0, numerator: 4, denominator: 4 },
  ]);
  hub.subscribe((e) => engine.handleInput(e));
  const mock = new MockMidiInput(hub, clock);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  transport.play();
  /** Spielt Taste `midi` zum Songzeitpunkt `sec` (bei Rate 1) */
  const at = (sec: number, midi: number) => {
    clock.set(sec * 1000);
    engine.update();
    mock.press(midi);
    mock.release(midi);
  };
  return { clock, transport, engine, mock, events, at };
}

describe('PerformanceEngine', () => {
  it('läuft ohne zu warten', () => {
    const { clock, transport } = setup([n(60, 0.5)]);
    clock.advance(2000);
    expect(transport.position).toBeCloseTo(2);
  });

  it('bewertet Perfect, Good (früh/spät) und Miss-Treffer', () => {
    const { engine, at, events } = setup([n(60, 1), n(62, 2), n(64, 3), n(65, 4)]);
    at(1.02, 60); // +20 ms perfect
    at(1.92, 62); // -80 ms good früh
    at(3.1, 64); // +100 ms good spät
    at(4.2, 65); // +200 ms → Miss-Treffer
    const t = engine.stats.timing;
    expect([t.perfect, t.good, t.missHits]).toEqual([1, 2, 1]);
    expect([t.early, t.onTime, t.late]).toEqual([1, 1, 2]);
    expect(engine.stats.correctNotes).toBe(3);
    expect(engine.stats.missedNotes).toBe(1);
    expect(events.filter((e) => e.type === 'hit').map((e) => e.type === 'hit' && e.grade)).toEqual([
      'perfect',
      'good',
      'good',
      'miss',
    ]);
  });

  it('zählt Tasten ohne passende Note als falsch', () => {
    const { engine, at } = setup([n(60, 1)]);
    at(1, 61);
    at(1.5, 60); // 500 ms zu spät → außerhalb Fangfenster → falsch
    expect(engine.stats.wrongNotes).toBe(2);
    expect(engine.keyJudgements.size).toBe(0);
  });

  it('markiert nicht gespielte Noten als verpasst, sobald das Fangfenster vorbei ist', () => {
    const { engine, clock, events } = setup([n(60, 1), n(62, 1)]);
    clock.set(1200);
    engine.update();
    expect(engine.stats.missedNotes).toBe(0);
    clock.set(1300);
    engine.update();
    expect(engine.stats.missedNotes).toBe(2);
    expect(events.filter((e) => e.type === 'missed')).toHaveLength(2);
  });

  it('ordnet bei Akkorden und Wiederholungen die nächstgelegene offene Note zu', () => {
    const { engine, at } = setup([n(60, 1), n(60, 1.2), n(64, 1)]);
    at(1.17, 60); // näher an 1,2 → trifft die zweite (30 ms früh)
    at(1.16, 64); // 160 ms spät → Miss-Treffer
    engine.update();
    expect(engine.stats.timing.perfect).toBe(1);
    expect(engine.stats.timing.missHits).toBe(1);
  });

  it('berücksichtigt den Latenzausgleich', () => {
    const { engine, at } = setup([n(60, 1)], { latencyMs: 100 });
    at(1.1, 60); // eingegangen 100 ms spät, aber Latenz 100 ms → perfekt
    expect(engine.stats.timing.perfect).toBe(1);
  });

  it('rechnet Timing-Fenster bei langsamem Tempo in Echtzeit', () => {
    const { engine, transport, clock, mock } = setup([n(60, 1)]);
    transport.setRate(0.5);
    // Songzeit 1,0 erreicht nach 2 s Echtzeit; 80 ms Echtzeit zu spät = 40 ms Songzeit
    clock.set(2080);
    mock.press(60);
    expect(engine.stats.timing.good).toBe(1);
    expect(engine.stats.timing.offsetsMs[0]).toBeCloseTo(80);
  });

  it('übt nur die gewählte Hand', () => {
    const { engine, at } = setup([n(48, 1, 'left'), n(60, 1)], { hands: 'right' });
    at(1, 60);
    at(1.01, 48);
    expect(engine.stats.correctNotes).toBe(1);
    expect(engine.stats.wrongNotes).toBe(1);
  });

  it('liefert am Ende ein vollständiges Ergebnis mit Timing', () => {
    const { at, clock, transport, events } = setup([n(60, 1), n(62, 2.5)], {}, 3);
    at(1.03, 60);
    clock.set(5000);
    expect(transport.position).toBe(3);
    const fin = events.find((e) => e.type === 'finished');
    expect(fin?.type === 'finished' && fin.result).toMatchObject({
      mode: 'performance',
      correctNotes: 1,
      missedNotes: 1,
      accuracy: 0.5,
      totalGroups: 2,
      complete: true,
      heatmap: [0, 1],
    });
    expect(fin?.type === 'finished' && fin.result.timing?.perfect).toBe(1);
  });

  it('markiert Durchgänge mit Sprüngen als unvollständig, Count-in-Seek aber nicht', () => {
    const a = setup([n(60, 1), n(62, 2)], {}, 3);
    a.clock.set(500);
    a.transport.seek(a.transport.position, 1); // Count-in an gleicher Stelle
    a.transport.seek(2.2); // echter Sprung
    a.clock.set(10_000);
    expect(a.transport.position).toBe(3);
    const fin = a.events.find((e) => e.type === 'finished');
    expect(fin?.type === 'finished' && fin.result.complete).toBe(false);
  });

  it('wertet im Loop-Bereich und setzt ihn pro Durchlauf zurück', () => {
    const { engine, at, transport } = setup([n(60, 0.5), n(62, 1), n(64, 2.5)]);
    engine.setRange(1, 2);
    at(1.0, 62);
    expect(engine.stats.correctNotes).toBe(1);
    engine.completePass();
    transport.seek(1);
    at(1.0, 62); // nächster Durchlauf: dieselbe Note erneut spielbar
    expect(engine.stats.correctNotes).toBe(2);
    at(2.5, 64); // außerhalb des Loops → falsch
    expect(engine.stats.wrongNotes).toBe(1);
  });

  it('zählt im Loop nicht gespielte Noten beim Durchlaufende als verpasst', () => {
    const { engine } = setup([n(60, 1), n(62, 1.5)]);
    engine.setRange(1, 2);
    engine.completePass();
    expect(engine.stats.missedNotes).toBe(2);
  });
});
