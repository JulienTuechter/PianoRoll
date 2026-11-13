import type { MidiStatus as Status } from '../core/midi-input/web-midi';
import { t, type Messages } from '../i18n';

/** Verständliche Texte und Hilfe zu jedem MIDI-Zustand. */
export function midiHelp(
  status: Status,
  m: Messages = t(),
): {
  tone: 'ok' | 'warn' | 'error' | 'info';
  title: string;
  help?: string;
} {
  switch (status.kind) {
    case 'idle':
    case 'requesting':
      return { tone: 'info', ...m.midi.requesting };
    case 'unsupported':
      return { tone: 'error', ...m.midi.unsupported };
    case 'insecure':
      return { tone: 'error', ...m.midi.insecure };
    case 'denied':
      return { tone: 'error', ...m.midi.denied };
    case 'error':
      return { tone: 'error', title: m.midi.error, help: status.message };
    case 'no-devices':
      return { tone: 'warn', ...m.midi.noDevices };
    case 'ready':
      return { tone: 'ok', title: m.midi.ready };
  }
}
