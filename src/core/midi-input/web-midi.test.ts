import { describe, expect, it, vi } from 'vitest';
import type { MidiAccessLike, MidiPortLike } from './web-midi';
import { WebMidiConnection } from './web-midi';
import type { MidiInputEvent } from './types';

function port(id: string, name: string, state: MidiPortLike['state'] = 'connected'): MidiPortLike {
  return { id, name, manufacturer: 'Test', state, onmidimessage: null };
}

function fakeAccess(ports: MidiPortLike[]): MidiAccessLike & { ports: MidiPortLike[]; fire(): void } {
  const a = {
    ports,
    inputs: { values: () => a.ports.values() },
    onstatechange: null as MidiAccessLike['onstatechange'],
    fire() {
      a.onstatechange?.({ port: { type: 'input' } });
    },
  };
  return a;
}

describe('WebMidiConnection', () => {
  it('meldet fehlende Web-MIDI-Unterstützung', async () => {
    const c = new WebMidiConnection({ isSecureContext: true }, () => {});
    await c.connect(null);
    expect(c.getState().status.kind).toBe('unsupported');
  });

  it('meldet unsicheren Kontext', async () => {
    const c = new WebMidiConnection(
      { isSecureContext: false, requestMIDIAccess: () => Promise.resolve(fakeAccess([])) },
      () => {},
    );
    await c.connect(null);
    expect(c.getState().status.kind).toBe('insecure');
  });

  it('meldet abgelehnte Berechtigung', async () => {
    const err = new Error('nope');
    err.name = 'SecurityError';
    const c = new WebMidiConnection(
      { isSecureContext: true, requestMIDIAccess: () => Promise.reject(err) },
      () => {},
    );
    await c.connect(null);
    expect(c.getState().status).toEqual({ kind: 'denied', message: 'nope' });
  });

  it('meldet "kein Gerät", verbindet sich bei Hot-Plug und leitet Events weiter', async () => {
    const access = fakeAccess([]);
    const events: MidiInputEvent[] = [];
    const c = new WebMidiConnection(
      { isSecureContext: true, requestMIDIAccess: () => Promise.resolve(access) },
      (e) => events.push(e),
    );
    await c.connect(null);
    expect(c.getState().status.kind).toBe('no-devices');

    const p = port('a', 'Alesis Recital Pro');
    access.ports.push(p);
    access.fire();
    expect(c.getState().status.kind).toBe('ready');
    expect(c.getState().activeDeviceId).toBe('a');

    p.onmidimessage?.({ data: new Uint8Array([0x90, 60, 100]), timeStamp: 42 });
    expect(events).toEqual([{ type: 'noteon', midi: 60, velocity: 100 / 127, timeMs: 42, source: 'midi' }]);
  });

  it('bevorzugt das gemerkte Gerät und wechselt zurück, wenn es wieder auftaucht', async () => {
    const other = port('x', 'Other');
    const piano = port('p', 'Piano', 'disconnected');
    const access = fakeAccess([other, piano]);
    const onDetach = vi.fn();
    const c = new WebMidiConnection(
      { isSecureContext: true, requestMIDIAccess: () => Promise.resolve(access) },
      () => {},
      onDetach,
    );
    await c.connect('p');
    expect(c.getState().activeDeviceId).toBe('x');

    piano.state = 'connected';
    access.fire();
    expect(c.getState().activeDeviceId).toBe('p');
    expect(other.onmidimessage).toBeNull();
    expect(onDetach).toHaveBeenCalledTimes(1);

    piano.state = 'disconnected';
    access.fire();
    expect(c.getState().activeDeviceId).toBe('x');
  });
});
