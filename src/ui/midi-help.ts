import type { MidiStatus as Status } from '../core/midi-input/web-midi';

/** Verständliche Texte und Hilfe zu jedem MIDI-Zustand. */
export function midiHelp(status: Status): {
  tone: 'ok' | 'warn' | 'error' | 'info';
  title: string;
  help?: string;
} {
  switch (status.kind) {
    case 'idle':
    case 'requesting':
      return {
        tone: 'info',
        title: 'MIDI wird angefragt …',
        help: 'Bitte den Berechtigungsdialog des Browsers bestätigen.',
      };
    case 'unsupported':
      return {
        tone: 'error',
        title: 'Browser ohne Web MIDI',
        help: 'Firefox (ab 108) und Brave unterstützen Web MIDI. In Brave muss es ggf. unter brave://settings/content/midiDevices erlaubt sein. Der Simulator funktioniert trotzdem.',
      };
    case 'insecure':
      return {
        tone: 'error',
        title: 'Unsichere Verbindung',
        help: 'Web MIDI funktioniert nur über https:// oder http://localhost. Bitte die App über http://localhost:5173 öffnen.',
      };
    case 'denied':
      return {
        tone: 'error',
        title: 'MIDI-Zugriff verweigert',
        help: 'Firefox: auf das Berechtigungssymbol links in der Adressleiste klicken, MIDI-Zugriff erlauben (Firefox installiert dafür ein kleines „Site Permission Add-on“) und die Seite neu laden. Brave: Schloss-Symbol → Website-Einstellungen → MIDI-Geräte → Zulassen, dann neu laden.',
      };
    case 'error':
      return { tone: 'error', title: 'MIDI-Fehler', help: status.message };
    case 'no-devices':
      return {
        tone: 'warn',
        title: 'Kein MIDI-Gerät gefunden',
        help: 'Piano einschalten und per USB-Kabel (USB-B-Buchse am Piano) mit dem Computer verbinden. Das Gerät erscheint automatisch.',
      };
    case 'ready':
      return { tone: 'ok', title: 'Verbunden' };
  }
}
