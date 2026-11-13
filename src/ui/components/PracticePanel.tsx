import type { HandFilter } from '../../core/wait-mode-engine/wait-mode-engine';
import { useSettings } from '../store/settings';

const HANDS: { id: HandFilter; label: string }[] = [
  { id: 'left', label: 'Links' },
  { id: 'both', label: 'Beide' },
  { id: 'right', label: 'Rechts' },
];

function preventArrows(e: React.KeyboardEvent): void {
  e.preventDefault();
}

/** Hände & Modus-spezifische Optionen */
export function PracticePanel() {
  const s = useSettings();
  if (s.mode === 'watch') {
    return (
      <p className="help">
        Im Modus „Anschauen“ läuft das Stück durch und wird vorgespielt. Wechsle oben auf „Warten“ oder
        „Performance“, um selbst zu spielen.
      </p>
    );
  }
  return (
    <div className="practice">
      <div className="field">
        Hände
        <div className="seg" role="group" aria-label="Geübte Hände">
          {HANDS.map((h) => (
            <button
              key={h.id}
              className={s.waitHands === h.id ? 'on' : ''}
              onClick={() => s.update({ waitHands: h.id })}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>
      {s.waitHands !== 'both' && (
        <label className="check">
          <input
            type="checkbox"
            checked={s.accompaniment}
            onChange={(e) => s.update({ accompaniment: e.target.checked })}
          />
          Andere Hand spielt automatisch mit
        </label>
      )}
      {s.mode === 'wait' && (
        <>
          <div className="field">
            Falsche Noten
            <div className="seg" role="group" aria-label="Strenge">
              <button
                className={!s.strict ? 'on' : ''}
                onClick={() => s.update({ strict: false })}
                title="Zusätzliche Noten werden toleriert"
              >
                Erlaubt
              </button>
              <button
                className={s.strict ? 'on' : ''}
                onClick={() => s.update({ strict: true })}
                title="Falsche Noten zählen als Fehler"
              >
                Zählen als Fehler
              </button>
            </div>
          </div>
          <label className="field">
            Akkord-Toleranz: {s.chordToleranceMs} ms
            <input
              type="range"
              min={50}
              max={500}
              step={25}
              value={s.chordToleranceMs}
              onChange={(e) => s.update({ chordToleranceMs: Number(e.target.value) })}
              onKeyDown={preventArrows}
            />
          </label>
          <label className="field">
            Hinweis nach Fehlversuchen
            <select
              value={s.hintAfterErrors}
              onChange={(e) => s.update({ hintAfterErrors: Number(e.target.value) })}
            >
              <option value={0}>Aus</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  nach {n}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {s.mode === 'performance' && (
        <p className="help">
          Perfect ≤ {s.perfectMs} ms, Good ≤ {s.goodMs} ms, sonst Miss. Fenster und Latenzausgleich in den
          Einstellungen.
        </p>
      )}
    </div>
  );
}

/** Metronom, Count-in, Auto-Tempo – in allen Modi verfügbar. */
export function PracticeTools() {
  const s = useSettings();
  return (
    <div className="practice">
      <label className="check">
        <input
          type="checkbox"
          checked={s.metronome}
          onChange={(e) => s.update({ metronome: e.target.checked })}
        />
        Metronom <kbd>Shift</kbd>+<kbd>M</kbd>
      </label>
      <label className="field">
        Metronom-Lautstärke
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.metronomeVolume}
          onChange={(e) => s.update({ metronomeVolume: Number(e.target.value) })}
          onKeyDown={preventArrows}
        />
      </label>
      <label className="field">
        Count-in
        <select value={s.countInBars} onChange={(e) => s.update({ countInBars: Number(e.target.value) })}>
          <option value={0}>Aus</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'Takt' : 'Takte'}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.autoTempo}
          onChange={(e) => s.update({ autoTempo: e.target.checked })}
        />
        Auto-Tempo im Loop
      </label>
      {s.autoTempo && (
        <div className="auto-tempo">
          nach
          <input
            type="number"
            min={1}
            max={20}
            value={s.autoTempoPasses}
            onChange={(e) => s.update({ autoTempoPasses: Math.max(1, Number(e.target.value) || 1) })}
            aria-label="Saubere Durchläufe"
          />
          sauberen Durchläufen +
          <input
            type="number"
            min={1}
            max={50}
            value={s.autoTempoStepPercent}
            onChange={(e) => s.update({ autoTempoStepPercent: Math.max(1, Number(e.target.value) || 1) })}
            aria-label="Steigerung in Prozent"
          />
          %, bis
          <input
            type="number"
            min={30}
            max={150}
            step={5}
            value={s.autoTempoMaxPercent}
            onChange={(e) =>
              s.update({ autoTempoMaxPercent: Math.min(150, Math.max(30, Number(e.target.value) || 100)) })
            }
            aria-label="Maximales Tempo in Prozent"
          />
          %
        </div>
      )}
      <p className="help">
        Loop: in der Taktleiste oben einen Bereich ziehen oder <kbd>L</kbd> drücken.
      </p>
    </div>
  );
}
