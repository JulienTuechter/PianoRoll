import type { HandFilter } from '../../core/wait-mode-engine/wait-mode-engine';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

const HANDS: HandFilter[] = ['left', 'both', 'right'];

function preventArrows(e: React.KeyboardEvent): void {
  e.preventDefault();
}

/** Hände & Modus-spezifische Optionen */
export function PracticePanel() {
  const t = useT();
  const s = useSettings();
  if (s.mode === 'watch') {
    return <p className="help">{t.practice.watchHelp}</p>;
  }
  return (
    <div className="practice">
      <div className="field">
        {t.practice.hands}
        <div className="seg" role="group" aria-label={t.practice.handsGroup}>
          {HANDS.map((h) => (
            <button
              key={h}
              className={s.waitHands === h ? 'on' : ''}
              onClick={() => s.update({ waitHands: h })}
            >
              {t.hands[h]}
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
          {t.practice.accompaniment}
        </label>
      )}
      {s.mode === 'wait' && (
        <>
          <div className="field">
            {t.practice.wrongNotes}
            <div className="seg" role="group" aria-label={t.practice.strictGroup}>
              <button
                className={!s.strict ? 'on' : ''}
                onClick={() => s.update({ strict: false })}
                title={t.practice.allowedTitle}
              >
                {t.practice.allowed}
              </button>
              <button
                className={s.strict ? 'on' : ''}
                onClick={() => s.update({ strict: true })}
                title={t.practice.countAsErrorTitle}
              >
                {t.practice.countAsError}
              </button>
            </div>
          </div>
          <label className="field">
            {t.practice.chordTolerance(s.chordToleranceMs)}
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
            {t.practice.hintAfter}
            <select
              value={s.hintAfterErrors}
              onChange={(e) => s.update({ hintAfterErrors: Number(e.target.value) })}
            >
              <option value={0}>{t.common.off}</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t.practice.afterN(n)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {s.mode === 'performance' && (
        <p className="help">{t.practice.performanceHelp(s.perfectMs, s.goodMs)}</p>
      )}
    </div>
  );
}

/** Metronom, Count-in, Auto-Tempo – in allen Modi verfügbar. */
export function PracticeTools() {
  const t = useT();
  const s = useSettings();
  const song = useApp((a) => a.song);
  return (
    <div className="practice">
      {!song && (
        <div className="rec-settings">
          <label className="field">
            {t.practice.tempoBpm}
            <input
              className="text-input"
              type="number"
              min={30}
              max={240}
              value={s.recBpm}
              onChange={(e) =>
                s.update({ recBpm: Math.min(240, Math.max(30, Number(e.target.value) || 90)) })
              }
            />
          </label>
          <label className="field">
            {t.common.meter}
            <select
              value={`${s.recNumerator}/${s.recDenominator}`}
              onChange={(e) => {
                const [n, d] = e.target.value.split('/').map(Number);
                s.update({ recNumerator: n ?? 4, recDenominator: d ?? 4 });
              }}
            >
              {['4/4', '3/4', '2/4', '6/8'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={s.metronome}
          onChange={(e) => s.update({ metronome: e.target.checked })}
        />
        {t.transport.metronome} <kbd>Shift</kbd>+<kbd>M</kbd>
      </label>
      <p className="help">{song ? t.practice.metronomeSong : t.practice.metronomeFree}</p>
      <label className="field">
        {t.practice.metronomeVolume}
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
        {t.practice.countIn}
        <select value={s.countInBars} onChange={(e) => s.update({ countInBars: Number(e.target.value) })}>
          <option value={0}>{t.common.off}</option>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {t.common.bars(n)}
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
        {t.practice.autoTempo}
      </label>
      {s.autoTempo && (
        <div className="auto-tempo">
          {t.practice.autoAfter}
          <input
            type="number"
            min={1}
            max={20}
            value={s.autoTempoPasses}
            onChange={(e) => s.update({ autoTempoPasses: Math.max(1, Number(e.target.value) || 1) })}
            aria-label={t.practice.autoPassesLabel}
          />
          {t.practice.autoPasses}
          <input
            type="number"
            min={1}
            max={50}
            value={s.autoTempoStepPercent}
            onChange={(e) => s.update({ autoTempoStepPercent: Math.max(1, Number(e.target.value) || 1) })}
            aria-label={t.practice.autoStepLabel}
          />
          {t.practice.autoUpTo}
          <input
            type="number"
            min={30}
            max={150}
            step={5}
            value={s.autoTempoMaxPercent}
            onChange={(e) =>
              s.update({ autoTempoMaxPercent: Math.min(150, Math.max(30, Number(e.target.value) || 100)) })
            }
            aria-label={t.practice.autoMaxLabel}
          />
          %
        </div>
      )}
      <p className="help">
        {t.practice.loopHelpBefore} <kbd>L</kbd>
        {t.practice.loopHelpAfter}
      </p>
    </div>
  );
}
