import { toggleRecording } from '../recording';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

const METERS = [
  [4, 4],
  [3, 4],
  [2, 4],
  [6, 8],
] as const;

/** Tempo, Taktart und Metronom für Aufnahmen (Count-in aus „Practice“). */
export function RecordingSettings() {
  const s = useSettings();
  const recording = useApp((a) => a.recording);
  return (
    <div className="practice">
      <div className="rec-settings">
        <label className="field">
          Tempo (BPM, wie im freien Spiel)
          <input
            className="text-input"
            type="number"
            min={30}
            max={240}
            value={s.recBpm}
            disabled={recording !== null}
            onChange={(e) => s.update({ recBpm: Math.min(240, Math.max(30, Number(e.target.value) || 90)) })}
          />
        </label>
        <label className="field">
          Taktart
          <select
            value={`${s.recNumerator}/${s.recDenominator}`}
            disabled={recording !== null}
            onChange={(e) => {
              const [n, d] = e.target.value.split('/').map(Number);
              s.update({ recNumerator: n ?? 4, recDenominator: d ?? 4 });
            }}
          >
            {METERS.map(([n, d]) => (
              <option key={`${n}/${d}`} value={`${n}/${d}`}>
                {n}/{d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={s.recMetronome}
          onChange={(e) => s.update({ recMetronome: e.target.checked })}
        />
        Metronom während der Aufnahme
      </label>
      <p className="help">
        Count-in: {Math.max(1, s.countInBars)} {Math.max(1, s.countInBars) === 1 ? 'Takt' : 'Takte'} (unter
        „Practice“). Ein geladenes Stück wird für die Aufnahme geschlossen.
      </p>
      <button className={`btn${recording ? ' active' : ' primary'}`} onClick={toggleRecording}>
        {recording ? '■ Aufnahme beenden' : '● Aufnahme starten'}
      </button>
    </div>
  );
}
