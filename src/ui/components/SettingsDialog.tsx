import { useEffect, useRef } from 'react';
import { midiToName } from '../../core/note-event-model/notes';
import { LOCALES, type LocalePref } from '../../i18n';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';
import { DEFAULT_LEFT, DEFAULT_RIGHT, luminance } from '../theme';
import { defaultSettings, useSettings, type VisualQuality } from '../store/settings';
import { prefersReducedMotion } from '../scene/scene-model';
import { MidiStatusPanel } from './MidiStatus';

/** Sprachnamen immer in der eigenen Sprache */
const LANGUAGE_NAMES: Record<(typeof LOCALES)[number], string> = { de: 'Deutsch', en: 'English' };

const QUALITIES: VisualQuality[] = ['low', 'medium', 'high'];
const QUALITY_LABEL = { low: 'qualityLow', medium: 'qualityMedium', high: 'qualityHigh' } as const;

export function SettingsDialog() {
  const t = useT();
  const reducedMotion = prefersReducedMotion();
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
      <h2>{t.settings.heading}</h2>

      <fieldset>
        <legend>{t.settings.language}</legend>
        <label className="field">
          <select
            value={s.locale}
            aria-label={t.settings.language}
            onChange={(e) => s.update({ locale: e.target.value as LocalePref })}
          >
            <option value="auto">{t.settings.languageAuto}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>{t.settings.midiDevice}</legend>
        <MidiStatusPanel />
      </fieldset>

      <fieldset>
        <legend>{t.settings.sound}</legend>
        <label className="check">
          <input type="checkbox" checked={s.echo} onChange={(e) => s.update({ echo: e.target.checked })} />
          {t.settings.echo}
        </label>
        <p className="help">{t.settings.echoHelp}</p>
        {s.echo && (
          <label className="field">
            {t.settings.echoVolume}
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
          {t.settings.simulatorSound}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.appSound}
            onChange={(e) => s.update({ appSound: e.target.checked })}
          />
          {t.settings.appSound}
        </label>
        <label className="field">
          {t.settings.appVolume}
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
        <legend>{t.settings.visual}</legend>
        <div className="field">
          {t.settings.quality}
          <div className="seg" role="group" aria-label={t.settings.quality}>
            {QUALITIES.map((q) => (
              <button
                key={q}
                className={s.visualQuality === q ? 'on' : ''}
                aria-pressed={s.visualQuality === q}
                onClick={() => s.update({ visualQuality: q })}
              >
                {t.settings[QUALITY_LABEL[q]]}
              </button>
            ))}
          </div>
        </div>
        <p className="help">{reducedMotion ? t.settings.reducedMotion : t.settings.qualityHelp}</p>
        <div className="field">
          {t.settings.colorMode}
          <div className="seg" role="group" aria-label={t.settings.colorMode}>
            <button
              className={s.noteColorMode === 'hand' ? 'on' : ''}
              aria-pressed={s.noteColorMode === 'hand'}
              onClick={() => s.update({ noteColorMode: 'hand' })}
            >
              {t.settings.colorByHand}
            </button>
            <button
              className={s.noteColorMode === 'pitch' ? 'on' : ''}
              aria-pressed={s.noteColorMode === 'pitch'}
              onClick={() => s.update({ noteColorMode: 'pitch' })}
              title={t.settings.colorByPitchTitle}
            >
              {t.settings.colorByPitch}
            </button>
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={s.beginnerMode}
            onChange={(e) => s.update({ beginnerMode: e.target.checked })}
          />
          {t.settings.beginner}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.showNoteNames}
            onChange={(e) => s.update({ showNoteNames: e.target.checked })}
          />
          {t.settings.noteNames}
        </label>
        <label className="field">
          {t.settings.fallWindow(t.common.seconds(s.fallWindowSec))}
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
          {t.settings.keyLabels}
          <select
            value={s.keyboardLabels}
            onChange={(e) => s.update({ keyboardLabels: e.target.value as typeof s.keyboardLabels })}
          >
            <option value="de">{t.settings.keyLabelsDe}</option>
            <option value="en">{t.settings.keyLabelsEn}</option>
            <option value="off">{t.common.off}</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>{t.settings.scoring}</legend>
        <label className="field">
          {t.settings.perfectUpTo(s.perfectMs)}
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
          {t.settings.goodUpTo(s.goodMs)}
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
          {t.settings.latency(s.latencyMs)}
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={s.latencyMs}
            onChange={(e) => s.update({ latencyMs: Number(e.target.value) })}
          />
        </label>
        <p className="help">{t.settings.latencyHelp}</p>
      </fieldset>

      <fieldset>
        <legend>{t.settings.colors}</legend>
        <div className="colors">
          <label>
            <input
              type="color"
              value={s.rightColor}
              onChange={(e) => s.update({ rightColor: e.target.value })}
            />{' '}
            {t.common.rightHand}
          </label>
          <label>
            <input
              type="color"
              value={s.leftColor}
              onChange={(e) => s.update({ leftColor: e.target.value })}
            />{' '}
            {t.common.leftHand}
          </label>
          <button
            className="btn small"
            onClick={() => s.update({ rightColor: DEFAULT_RIGHT, leftColor: DEFAULT_LEFT })}
          >
            {t.settings.colorsDefault}
          </button>
          <button
            className="btn small"
            onClick={() => s.update({ rightColor: '#F0E442', leftColor: '#7B3FA0' })}
          >
            {t.settings.colorsContrast}
          </button>
        </div>
        {Math.abs(luminance(s.rightColor) - luminance(s.leftColor)) < 0.12 && (
          <p className="help warn-text">{t.settings.colorsWarn}</p>
        )}
      </fieldset>

      <fieldset>
        <legend>{t.settings.songs}</legend>
        <label className="field">
          {t.settings.defaultSplit(midiToName(s.splitPoint))}
          <input
            type="range"
            min={36}
            max={84}
            value={s.splitPoint}
            onChange={(e) => s.update({ splitPoint: Number(e.target.value) })}
          />
        </label>
        <p className="help">{t.settings.splitHelp}</p>
      </fieldset>

      <fieldset>
        <legend>{t.settings.simulator}</legend>
        <label className="field">
          {t.settings.simVelocity(Math.round(s.simulatorVelocity * 127))}
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
          onClick={() =>
            s.update({
              ...defaultSettings,
              onboardingDone: true,
              midiDeviceId: s.midiDeviceId,
              locale: s.locale,
            })
          }
        >
          {t.settings.reset}
        </button>
        <button className="btn" onClick={() => s.update({ onboardingDone: false })}>
          {t.settings.showWizard}
        </button>
        <button className="btn primary" onClick={() => setApp({ settingsOpen: false })}>
          {t.common.close}
        </button>
      </div>
    </dialog>
  );
}
