import { useEffect, useRef } from 'react';
import { midiToName } from '../../core/note-event-model/notes';
import { useApp } from '../store/app-store';
import { DEFAULT_LEFT, DEFAULT_RIGHT, luminance } from '../theme';
import { defaultSettings, useSettings } from '../store/settings';
import { MidiStatusPanel } from './MidiStatus';

export function SettingsDialog() {
  const open = useApp((s) => s.settingsOpen);
  const setApp = useApp((s) => s.set);
  const s = useSettings();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={() => setApp({ settingsOpen: false })}>
      <h2>Einstellungen</h2>

      <fieldset>
        <legend>MIDI-Gerät</legend>
        <MidiStatusPanel />
      </fieldset>

      <fieldset>
        <legend>Klang</legend>
        <label className="check">
          <input type="checkbox" checked={s.echo} onChange={(e) => s.update({ echo: e.target.checked })} />
          Eigenes Spiel über die App wiedergeben (Echo)
        </label>
        <p className="help">
          Der Recital Pro hat eigene Lautsprecher. Mit Echo hörst du jede Note doppelt – nur einschalten, wenn
          der Piano-Lautsprecher aus ist (z. B. Kopfhörer am Computer).
        </p>
        {s.echo && (
          <label className="field">
            Echo-Lautstärke
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.echoVolume}
              onChange={(e) => s.update({ echoVolume: Number(e.target.value) })}
            />
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={s.simulatorSound}
            onChange={(e) => s.update({ simulatorSound: e.target.checked })}
          />
          Simulator (Computertastatur/Maus) hörbar
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.appSound}
            onChange={(e) => s.update({ appSound: e.target.checked })}
          />
          App-Klang (Vorspielen, Begleitung, später Metronom)
        </label>
        <label className="field">
          App-Lautstärke
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.appVolume}
            onChange={(e) => s.update({ appVolume: Number(e.target.value) })}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Visuell</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={s.beginnerMode}
            onChange={(e) => s.update({ beginnerMode: e.target.checked })}
          />
          Anfängermodus: Führungsstrahl zur Taste, Zieltaste leuchtet vorher mit Notennamen auf
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.particles}
            onChange={(e) => s.update({ particles: e.target.checked })}
          />
          Partikeleffekte: Funken, wenn Noten auf die Klaviatur treffen bzw. im freien Spiel aufsteigen
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.showNoteNames}
            onChange={(e) => s.update({ showNoteNames: e.target.checked })}
          />
          Notennamen auf fallenden Noten
        </label>
        <label className="field">
          Vorschauzeit fallender Noten: {s.fallWindowSec.toFixed(1)} s
          <input
            type="range"
            min={1.5}
            max={8}
            step={0.5}
            value={s.fallWindowSec}
            onChange={(e) => s.update({ fallWindowSec: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          Tastenbeschriftung (Simulator)
          <select
            value={s.keyboardLabels}
            onChange={(e) => s.update({ keyboardLabels: e.target.value as typeof s.keyboardLabels })}
          >
            <option value="de">Deutsche Tastatur (QWERTZ)</option>
            <option value="en">Englische Tastatur (QWERTY)</option>
            <option value="off">Aus</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Performance-Wertung &amp; Latenz</legend>
        <label className="field">
          Perfect bis {s.perfectMs} ms
          <input
            type="range"
            min={20}
            max={120}
            step={5}
            value={s.perfectMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              s.update({ perfectMs: v, goodMs: Math.max(s.goodMs, v + 10) });
            }}
          />
        </label>
        <label className="field">
          Good bis {s.goodMs} ms (danach Miss)
          <input
            type="range"
            min={60}
            max={300}
            step={10}
            value={s.goodMs}
            onChange={(e) => {
              const v = Number(e.target.value);
              s.update({ goodMs: v, perfectMs: Math.min(s.perfectMs, v - 10) });
            }}
          />
        </label>
        <label className="field">
          Latenzausgleich: {s.latencyMs} ms
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={s.latencyMs}
            onChange={(e) => s.update({ latencyMs: Number(e.target.value) })}
          />
        </label>
        <p className="help">
          Wird vom Zeitpunkt jedes Anschlags abgezogen. Tipp: Zeigt das Ergebnis im Performance-Modus „im
          Schnitt X ms zu spät“, obwohl du dich pünktlich fühlst, den Wert um etwa X erhöhen.
        </p>
      </fieldset>

      <fieldset>
        <legend>Farben</legend>
        <div className="colors">
          <label>
            <input
              type="color"
              value={s.rightColor}
              onChange={(e) => s.update({ rightColor: e.target.value })}
            />{' '}
            Rechte Hand
          </label>
          <label>
            <input
              type="color"
              value={s.leftColor}
              onChange={(e) => s.update({ leftColor: e.target.value })}
            />{' '}
            Linke Hand
          </label>
          <button
            className="btn small"
            onClick={() => s.update({ rightColor: DEFAULT_RIGHT, leftColor: DEFAULT_LEFT })}
          >
            Standard
          </button>
          <button
            className="btn small"
            onClick={() => s.update({ rightColor: '#F0E442', leftColor: '#7B3FA0' })}
          >
            Gelb/Lila (hoher Kontrast)
          </button>
        </div>
        {Math.abs(luminance(s.rightColor) - luminance(s.leftColor)) < 0.12 && (
          <p className="help warn-text">
            Beide Farben sind ähnlich hell – für Farbenblinde schwer zu unterscheiden. Wähle eine hellere und
            eine dunklere Farbe.
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Stücke</legend>
        <label className="field">
          Standard-Split-Punkt für neue Stücke: {midiToName(s.splitPoint)}
          <input
            type="range"
            min={36}
            max={84}
            value={s.splitPoint}
            onChange={(e) => s.update({ splitPoint: Number(e.target.value) })}
          />
        </label>
        <p className="help">
          Gilt für Spuren mit Zuordnung „Split“. Pro Stück lässt sich der Punkt im Seitenpanel anpassen.
        </p>
      </fieldset>

      <fieldset>
        <legend>Simulator</legend>
        <label className="field">
          Anschlagstärke Computertastatur: {Math.round(s.simulatorVelocity * 127)}
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={s.simulatorVelocity}
            onChange={(e) => s.update({ simulatorVelocity: Number(e.target.value) })}
          />
        </label>
      </fieldset>

      <div className="dialog-actions">
        <button
          className="btn"
          onClick={() => s.update({ ...defaultSettings, onboardingDone: true, midiDeviceId: s.midiDeviceId })}
        >
          Zurücksetzen
        </button>
        <button className="btn" onClick={() => s.update({ onboardingDone: false })}>
          MIDI-Assistent erneut zeigen
        </button>
        <button className="btn primary" onClick={() => setApp({ settingsOpen: false })}>
          Schließen
        </button>
      </div>
    </dialog>
  );
}
