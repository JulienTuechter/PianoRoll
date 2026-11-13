import { parseMidiMessage } from './parse';
import type { MidiInputEvent } from './types';

/*
 * Minimale Strukturtypen statt der DOM-Typen, damit sich der Adapter in Tests mit einfachen Objekten
 * füttern lässt. Die echten Web-MIDI-Objekte erfüllen diese Interfaces.
 */
export interface MidiPortLike {
  id: string;
  name: string | null;
  manufacturer?: string | null;
  state: 'connected' | 'disconnected';
  onmidimessage: ((ev: { data: Uint8Array | null; timeStamp: number }) => void) | null;
}

export interface MidiAccessLike {
  inputs: { values(): IterableIterator<MidiPortLike> | Iterable<MidiPortLike> };
  onstatechange: ((ev: { port: { type: string } | null }) => void) | null;
}

export interface MidiEnvironment {
  isSecureContext: boolean;
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
}

export type MidiStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'unsupported' }
  | { kind: 'insecure' }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'no-devices' }
  | { kind: 'ready' };

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
}

export interface WebMidiState {
  status: MidiStatus;
  devices: MidiDevice[];
  /** Tatsächlich verbundenes Gerät */
  activeDeviceId: string | null;
}

type StateListener = (s: WebMidiState) => void;

/**
 * Verwaltet Web-MIDI-Zugriff, Geräteauswahl und Hot-Plug.
 * Wenn das gewünschte Gerät verschwindet und wieder auftaucht, wird es automatisch neu verbunden.
 */
export class WebMidiConnection {
  private access: MidiAccessLike | null = null;
  private attached: MidiPortLike | null = null;
  private preferredId: string | null = null;
  private state: WebMidiState = { status: { kind: 'idle' }, devices: [], activeDeviceId: null };
  private readonly stateListeners = new Set<StateListener>();

  constructor(
    private readonly env: MidiEnvironment,
    private readonly onEvent: (e: MidiInputEvent) => void,
    /** Wird aufgerufen, wenn das aktive Gerät getrennt wird (z. B. um hängende Noten zu lösen). */
    private readonly onDetach: () => void = () => {},
  ) {}

  getState(): WebMidiState {
    return this.state;
  }

  onStateChange(l: StateListener): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  async connect(preferredDeviceId: string | null): Promise<void> {
    this.preferredId = preferredDeviceId;
    if (!this.env.requestMIDIAccess) return this.setStatus({ kind: 'unsupported' });
    if (!this.env.isSecureContext) return this.setStatus({ kind: 'insecure' });
    this.setStatus({ kind: 'requesting' });
    try {
      this.access = await this.env.requestMIDIAccess({ sysex: false });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message : String(err);
      if (name === 'SecurityError' || name === 'NotAllowedError') {
        return this.setStatus({ kind: 'denied', message });
      }
      return this.setStatus({ kind: 'error', message });
    }
    this.access.onstatechange = () => this.refresh();
    this.refresh();
  }

  selectDevice(id: string | null): void {
    this.preferredId = id;
    this.refresh();
  }

  dispose(): void {
    this.detach();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
  }

  private refresh(): void {
    if (!this.access) return;
    const ports = [...this.access.inputs.values()];
    const connected = ports.filter((p) => p.state === 'connected');
    const devices: MidiDevice[] = ports.map((p) => ({
      id: p.id,
      name: p.name ?? 'Unbekanntes Gerät',
      manufacturer: p.manufacturer ?? '',
      connected: p.state === 'connected',
    }));

    const target =
      connected.find((p) => p.id === this.preferredId) ??
      // Kein Wunschgerät (oder nicht da): erstes verbundenes nehmen, Wunsch bleibt gemerkt
      connected[0] ??
      null;

    if (target !== this.attached) {
      this.detach();
      if (target) this.attach(target);
    }

    this.state = {
      status: connected.length === 0 ? { kind: 'no-devices' } : { kind: 'ready' },
      devices,
      activeDeviceId: this.attached?.id ?? null,
    };
    this.notify();
  }

  private attach(port: MidiPortLike): void {
    this.attached = port;
    port.onmidimessage = (ev) => {
      if (!ev.data) return;
      const parsed = parseMidiMessage(ev.data, ev.timeStamp, 'midi');
      if (parsed) this.onEvent(parsed);
    };
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached.onmidimessage = null;
    this.attached = null;
    this.onDetach();
  }

  private setStatus(status: MidiStatus): void {
    this.state = { ...this.state, status };
    this.notify();
  }

  private notify(): void {
    for (const l of this.stateListeners) l(this.state);
  }
}
