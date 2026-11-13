import { describe, expect, it } from 'vitest';
import { salamanderSampleMap, sampleFileForMidi, velocityToGain } from './samples';
import { SustainTracker } from './sustain';

describe('SustainTracker', () => {
  it('beendet Noten ohne Pedal sofort', () => {
    const s = new SustainTracker();
    s.noteOn(60);
    expect(s.noteOff(60)).toBe(true);
  });

  it('hält Noten bei gedrücktem Pedal und gibt sie beim Loslassen frei', () => {
    const s = new SustainTracker();
    s.setPedal(true);
    s.noteOn(60);
    s.noteOn(64);
    expect(s.noteOff(60)).toBe(false);
    expect(s.noteOff(64)).toBe(false);
    expect(s.setPedal(false).sort()).toEqual([60, 64]);
  });

  it('hält beim Loslassen des Pedals noch gedrückte Tasten weiter', () => {
    const s = new SustainTracker();
    s.setPedal(true);
    s.noteOn(60);
    expect(s.setPedal(false)).toEqual([]);
    expect(s.noteOff(60)).toBe(true);
  });

  it('meldet Retrigger bei erneutem Anschlag einer gehaltenen Note', () => {
    const s = new SustainTracker();
    s.setPedal(true);
    s.noteOn(60);
    s.noteOff(60);
    expect(s.noteOn(60).retrigger).toBe(true);
    expect(s.noteOff(60)).toBe(false);
    expect(s.setPedal(false)).toEqual([60]);
  });

  it('ignoriert doppelte Note Offs', () => {
    const s = new SustainTracker();
    s.noteOn(60);
    expect(s.noteOff(60)).toBe(true);
    expect(s.noteOff(60)).toBe(false);
  });
});

describe('Samples', () => {
  it('bildet Salamander-Dateinamen', () => {
    expect(sampleFileForMidi(21)).toBe('A0.mp3');
    expect(sampleFileForMidi(63)).toBe('Ds4.mp3');
    expect(sampleFileForMidi(108)).toBe('C8.mp3');
    expect(sampleFileForMidi(61)).toBeNull();
  });

  it('erzeugt 30 Samples von A0 bis C8', () => {
    const map = salamanderSampleMap();
    expect(Object.keys(map)).toHaveLength(30);
    expect(map['F#3']).toBe('Fs3.mp3');
  });

  it('Velocity-Kurve ist monoton und begrenzt', () => {
    expect(velocityToGain(0)).toBeGreaterThan(0);
    expect(velocityToGain(1)).toBeCloseTo(1);
    expect(velocityToGain(0.5)).toBeLessThan(velocityToGain(0.6));
    expect(velocityToGain(2)).toBeCloseTo(1);
  });
});
