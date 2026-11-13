import { describe, expect, it } from 'vitest';
import { NoteTrail } from './note-trail';

describe('NoteTrail', () => {
  it('führt gehaltene und losgelassene Noten', () => {
    const t = new NoteTrail();
    t.noteOn(60, 0, 0.8);
    t.noteOn(64, 10, 0.5);
    t.noteOff(60, 500);
    expect(t.notes.map((n) => [n.midi, n.endMs])).toEqual([
      [60, 500],
      [64, null],
    ]);
  });

  it('beendet eine Note bei erneutem Anschlag', () => {
    const t = new NoteTrail();
    t.noteOn(60, 0, 1);
    t.noteOn(60, 200, 1);
    expect(t.notes).toHaveLength(2);
    expect(t.notes[0]?.endMs).toBe(200);
  });

  it('verwirft alte Einträge, behält aber gehaltene Noten', () => {
    const t = new NoteTrail(1000);
    t.noteOn(48, 0, 1); // wird gehalten
    t.noteOn(60, 0, 1);
    t.noteOff(60, 100);
    t.mark('C', 0);
    t.prune(5000);
    expect(t.notes.map((n) => n.midi)).toEqual([48]);
    expect(t.marks).toHaveLength(0);
  });

  it('wiederholt gleiche Marken nicht sofort', () => {
    const t = new NoteTrail();
    t.mark('C', 0);
    t.mark('C', 500);
    t.mark('Am', 600);
    t.mark('C', 3000);
    expect(t.marks.map((m) => m.label)).toEqual(['C', 'Am', 'C']);
  });
});
