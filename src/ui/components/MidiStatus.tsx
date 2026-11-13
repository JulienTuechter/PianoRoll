import { midiHelp } from '../midi-help';
import { webMidi } from '../runtime';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

export function MidiStatusPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const midi = useApp((s) => s.midi);
  const update = useSettings((s) => s.update);
  const info = midiHelp(midi.status, t);
  const active = midi.devices.find((d) => d.id === midi.activeDeviceId);
  const connected = midi.devices.filter((d) => d.connected);

  return (
    <div className={`midi-status tone-${info.tone}`}>
      <div className="midi-status-head">
        <span className="dot" />
        <strong>{active ? active.name : info.title}</strong>
      </div>
      {!compact && info.help && <p className="help">{info.help}</p>}
      {connected.length > 1 && (
        <label className="field">
          {t.midi.device}
          <select
            value={midi.activeDeviceId ?? ''}
            onChange={(e) => {
              update({ midiDeviceId: e.target.value });
              webMidi.selectDevice(e.target.value);
            }}
          >
            {connected.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {['denied', 'error', 'unsupported', 'insecure'].includes(midi.status.kind) && (
        <button
          className="btn small"
          onClick={() => void webMidi.connect(useSettings.getState().midiDeviceId)}
        >
          {t.midi.retry}
        </button>
      )}
    </div>
  );
}
