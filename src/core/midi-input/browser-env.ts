import type { MidiAccessLike, MidiEnvironment, MidiPortLike } from './web-midi';

/**
 * Adapter von der echten Web MIDI API auf die schlanken Strukturtypen.
 * Wrapper werden pro Port gecacht, damit Identitätsvergleiche im WebMidiConnection funktionieren.
 */
export function browserMidiEnvironment(): MidiEnvironment {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
  if (!nav || typeof nav.requestMIDIAccess !== 'function') return { isSecureContext };

  const cache = new WeakMap<MIDIInput, MidiPortLike>();
  const wrapPort = (p: MIDIInput): MidiPortLike => {
    const cached = cache.get(p);
    if (cached) return cached;
    let handler: MidiPortLike['onmidimessage'] = null;
    const wrapper: MidiPortLike = {
      get id() {
        return p.id;
      },
      get name() {
        return p.name;
      },
      get manufacturer() {
        return p.manufacturer;
      },
      get state() {
        return p.state;
      },
      get onmidimessage() {
        return handler;
      },
      set onmidimessage(h) {
        handler = h;
        p.onmidimessage = h ? (ev: MIDIMessageEvent) => h({ data: ev.data, timeStamp: ev.timeStamp }) : null;
      },
    };
    cache.set(p, wrapper);
    return wrapper;
  };

  return {
    isSecureContext,
    requestMIDIAccess: async (options) => {
      const access = await nav.requestMIDIAccess(options);
      let stateHandler: MidiAccessLike['onstatechange'] = null;
      const like: MidiAccessLike = {
        inputs: { values: () => [...access.inputs.values()].map(wrapPort) },
        get onstatechange() {
          return stateHandler;
        },
        set onstatechange(h) {
          stateHandler = h;
          access.onstatechange = h
            ? (ev: MIDIConnectionEvent) => h({ port: ev.port ? { type: ev.port.type } : null })
            : null;
        },
      };
      return like;
    },
  };
}
