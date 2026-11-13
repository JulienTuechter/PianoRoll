import { describe, expect, it } from 'vitest';
import { InputHub } from '../midi-input/input-hub';
import { MockMidiInput } from '../midi-input/mock-input';
import type { Hand, NoteEvent } from '../note-event-model/types';
import { Transport } from '../playback/transport';
import { FakeClock } from '../time/clock';
import {
  buildWaitGroups,
  defaultWaitConfig,
  WaitModeEngine,
  type WaitEvent,
  type WaitModeConfig,
} from './wait-mode-engine';

let id = 0;
function n(midi: number, startSec: number, hand: Hand = 'right', durationSec = 0.4): NoteEvent {
  return { id: String(id++), midi, startTick: 0, startSec, durationSec, velocity: 0.8, hand, track: 0 };
}

function setup(notes: NoteEvent[], config: Partial<WaitModeConfig> = {}) {
  const clock = new FakeClock(1000);
  const transport = new Transport(clock, 10);
  const hub = new InputHub();
  const engine = new WaitModeEngine(transport, clock, notes, { ...defaultWaitConfig, ...config }, [
    { index: 0, startSec: 0, startTick: 0, numerator: 4, denominator: 4 },
    { index: 1, startSec: 2, startTick: 0, numerator: 4, denominator: 4 },
  ]);
  hub.subscribe((e) => engine.handleInput(e));
  const mock = new MockMidiInput(hub, clock);
  const events: WaitEvent[] = [];
  engine.on((e) => events.push(e));
  transport.play();
  return { clock, transport, engine, mock, events };
}

describe('buildWaitGroups', () => {
  it('filtert nach Hand und gruppiert Akkorde', () => {
    const notes = [n(48, 0, 'left'), n(60, 0), n(64, 0.02), n(62, 1), n(50, 1, 'left')];
    expect(
      buildWaitGroups(notes, { hands: 'right', groupWindowSec: 0.04 }).map((g) => [...g.expected.keys()]),
    ).toEqual([[60, 64], [62]]);
    expect(buildWaitGroups(notes, { hands: 'left', groupWindowSec: 0.04 })).toHaveLength(2);
    expect(buildWaitGroups(notes, { hands: 'both', groupWindowSec: 0.04 })[0]?.expected.size).toBe(3);
  });

  it('entfernt doppelte Tonhöhen aus mehreren Spuren', () => {
    const g = buildWaitGroups([n(60, 0), n(60, 0)], { hands: 'both', groupWindowSec: 0.04 });
    expect(g[0]?.expected.size).toBe(1);
  });
});

describe('WaitModeEngine', () => {
  it('hält die Zeit an, bis die erwartete Note gespielt wird', () => {
    const { clock, transport, mock, engine } = setup([n(60, 0.5), n(62, 1)]);
    clock.advance(2000);
    expect(transport.position).toBe(0.5);
    expect(transport.waiting).toBe(true);
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(1);
    clock.advance(200);
    expect(transport.position).toBeCloseTo(0.7);
    clock.advance(1000);
    expect(transport.position).toBe(1);
  });

  it('verlangt bei Akkorden alle Töne gleichzeitig', () => {
    const { mock, engine, events } = setup([n(60, 0), n(64, 0), n(67, 0), n(72, 1)]);
    mock.press(60);
    mock.press(64);
    expect(engine.currentGroupIndex).toBe(0);
    mock.press(67);
    expect(engine.currentGroupIndex).toBe(1);
    expect(events.filter((e) => e.type === 'group-complete')).toHaveLength(1);
  });

  it('akzeptiert kurz zuvor losgelassene Akkordtöne innerhalb der Toleranz', () => {
    const { mock, clock, engine } = setup([n(60, 0), n(64, 0), n(72, 1)], { chordToleranceMs: 150 });
    mock.press(60);
    clock.advance(50);
    mock.release(60);
    clock.advance(100);
    mock.press(64);
    expect(engine.currentGroupIndex).toBe(1);
  });

  it('lehnt Akkordtöne ab, die zu lange losgelassen sind', () => {
    const { mock, clock, engine } = setup([n(60, 0), n(64, 0), n(72, 1)], { chordToleranceMs: 150 });
    mock.press(60);
    mock.release(60);
    clock.advance(400);
    mock.press(64);
    expect(engine.currentGroupIndex).toBe(0);
    // Nochmals anschlagen, während 64 gehalten wird → erfüllt
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(1);
  });

  it('verlangt bei wiederholter Tonhöhe einen neuen Anschlag', () => {
    const { mock, engine, clock } = setup([n(60, 0), n(60, 0.5)]);
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(1);
    clock.advance(1000);
    // Taste wird noch gehalten → zählt nicht für die zweite Gruppe
    expect(engine.currentGroupIndex).toBe(1);
    mock.release(60);
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(2);
  });

  it('zählt falsche Noten im strengen Modus als Fehler, ohne abzubrechen', () => {
    const { mock, engine, events } = setup([n(60, 0), n(62, 2.5)], { strict: true });
    mock.press(61);
    mock.release(61);
    expect(engine.stats.wrongNotes).toBe(1);
    expect(engine.stats.errorsByMeasure.get(0)).toBe(1);
    expect(engine.keyJudgements.has(61)).toBe(false);
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(1);
    expect(events.find((e) => e.type === 'group-complete')).toMatchObject({ hadErrors: true });
    expect(engine.stats.streak).toBe(1);
  });

  it('erlaubt Extra-Noten im lockeren Modus', () => {
    const { mock, engine } = setup([n(60, 0)], { strict: false });
    mock.press(50);
    expect(engine.keyJudgements.get(50)).toBe('wrong');
    mock.press(60);
    expect(engine.stats.wrongNotes).toBe(0);
    expect(engine.stats.extraNotes).toBe(1);
    expect(engine.currentGroupIndex).toBe(1);
  });

  it('aktiviert den Hinweis nach mehreren Fehlversuchen', () => {
    const { mock, engine, events } = setup([n(60, 0), n(62, 1)], { hintAfterErrors: 2 });
    mock.press(61);
    expect(engine.hint).toBe(false);
    mock.press(63);
    expect(engine.hint).toBe(true);
    expect(events.filter((e) => e.type === 'hint')).toHaveLength(1);
    mock.press(60);
    expect(engine.hint).toBe(false);
  });

  it('nimmt Noten kurz vor der Gruppe an (Frühfenster), aber nicht zu früh', () => {
    const { mock, clock, engine, transport } = setup([n(60, 1)], { earlyWindowSec: 0.3, strict: true });
    clock.advance(500);
    mock.press(60); // 0,5 s zu früh → falsch
    mock.release(60);
    expect(engine.stats.wrongNotes).toBe(1);
    clock.advance(300); // Position 0,8 → im Fenster
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(1);
    clock.advance(500);
    expect(transport.position).toBeCloseTo(1.3); // läuft ohne anzuhalten weiter
  });

  it('ignoriert Eingaben, solange pausiert ist', () => {
    const { mock, engine, transport } = setup([n(60, 0)]);
    transport.pause();
    mock.press(60);
    expect(engine.currentGroupIndex).toBe(0);
  });

  it('übt nur die gewählte Hand; die andere hält die Zeit nicht an', () => {
    const { mock, engine, transport, clock } = setup([n(48, 0, 'left'), n(60, 0.5), n(50, 1, 'left')], {
      hands: 'right',
    });
    clock.advance(2000);
    expect(transport.position).toBe(0.5);
    mock.press(60);
    clock.advance(2000);
    expect(transport.position).toBeCloseTo(2.5);
    expect(engine.currentGroup).toBeNull();
  });

  it('springt bei Seek zur passenden Gruppe und behält die Statistik', () => {
    const { mock, engine, transport } = setup([n(60, 0), n(62, 1), n(64, 2)]);
    mock.press(60);
    transport.seek(1.5);
    expect(engine.currentGroupIndex).toBe(2);
    expect(transport.holdAt).toBe(2);
    expect(engine.stats.correctNotes).toBe(1);
  });

  it('markiert Durchgänge mit übersprungenen Stellen als unvollständig', () => {
    const { mock, transport, clock, events } = setup([n(60, 0), n(62, 1), n(64, 2)]);
    mock.press(60);
    transport.seek(1.5);
    clock.advance(1000); // wartet an der Gruppe bei 2,0
    mock.press(64);
    clock.advance(20_000);
    expect(transport.position).toBe(10);
    const fin = events.find((e) => e.type === 'finished');
    expect(fin?.type === 'finished' && fin.result).toMatchObject({
      complete: false,
      completedGroups: 2,
      totalGroups: 3,
    });
  });

  it('meldet am Ende ein Ergebnis mit Heatmap und startet bei Play neu', () => {
    const { mock, clock, transport, events, engine } = setup([n(60, 0), n(62, 2.2)], { strict: true });
    mock.press(61);
    mock.press(60);
    clock.advance(2200);
    mock.press(63);
    mock.press(62);
    clock.advance(10_000);
    expect(transport.position).toBe(10); // Lesen der Position stellt das Ende fest
    expect(transport.state).toBe('ended');
    const fin = events.find((e) => e.type === 'finished');
    expect(fin?.type === 'finished' && fin.result).toMatchObject({
      correctNotes: 2,
      wrongNotes: 2,
      accuracy: 0.5,
      totalGroups: 2,
      completedGroups: 2,
      complete: true,
      cleanGroups: 0,
      heatmap: [1, 1],
    });
    transport.play();
    expect(engine.stats.correctNotes).toBe(0);
    expect(engine.currentGroupIndex).toBe(0);
    expect(engine.isFinished).toBe(false);
  });

  it('wartet im Loop nur auf Gruppen im Bereich und lässt danach bis zum Loop-Ende laufen', () => {
    const { engine, transport, mock, clock } = setup([n(60, 0), n(62, 1), n(64, 1.5), n(65, 3)]);
    engine.setRange(1, 2);
    expect(engine.currentGroup?.startSec).toBe(1);
    expect(engine.groupsInRange).toBe(2);
    clock.advance(5000);
    expect(transport.position).toBe(1);
    mock.press(62);
    clock.advance(500); // bis 1,5 (Haltepunkt der nächsten Gruppe)
    mock.press(64);
    expect(engine.currentGroup).toBeNull();
    expect(transport.holdAt).toBeNull();
    clock.advance(400);
    expect(transport.position).toBeCloseTo(1.9);
    engine.completePass();
    expect(engine.currentGroup?.startSec).toBe(1);
  });

  it('beginnt nach Count-in-Vorlauf bei der ersten Gruppe des Bereichs', () => {
    const { engine, transport } = setup([n(60, 0), n(62, 1)]);
    engine.setRange(1, null);
    transport.seek(1, 2); // Position −1, Ziel 1
    expect(engine.currentGroup?.startSec).toBe(1);
  });

  it('gibt beim Aufräumen den Haltepunkt frei', () => {
    const { engine, transport } = setup([n(60, 1)]);
    expect(transport.holdAt).toBe(1);
    engine.dispose();
    expect(transport.holdAt).toBeNull();
  });
});
