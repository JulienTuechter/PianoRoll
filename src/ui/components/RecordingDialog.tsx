import { useEffect, useMemo, useRef, useState } from 'react';
import { songHistogram } from '../../core/chord-detection/song-chords';
import { estimateKey } from '../../core/key-detection/krumhansl';
import { buildMeasures, TempoMap } from '../../core/note-event-model/tempo-map';
import { midiToName } from '../../core/note-event-model/notes';
import { quantize } from '../../core/quantizer/quantizer';
import { exportMidi, exportMusicXml, exportPng, exportSvg, midiBytes, type ExportSource } from '../export';
import { formatTime } from '../format';
import { renderScore } from '../notation/render-score';
import { scoreFor } from '../notation/score-for-song';
import { discardTake, startRecording } from '../recording';
import { t as msg } from '../../i18n';
import { keyName } from '../../i18n/music';
import { useT } from '../i18n';
import { importBytes, errorMessage } from '../runtime';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

function defaultTitle(startedAt: number): string {
  const d = new Date(startedAt);
  const m = msg();
  return m.recording.defaultTitle(
    d.toLocaleDateString(m.dateLocale, { day: '2-digit', month: '2-digit' }),
    d.toLocaleTimeString(m.dateLocale, { hour: '2-digit', minute: '2-digit' }),
  );
}

/** Aufnahme bearbeiten: Quantisierung einstellen, Notenvorschau prüfen, exportieren oder in die Bibliothek speichern. */
export function RecordingDialog() {
  const t = useT();
  const take = useApp((s) => s.take);
  const s = useSettings();
  const ref = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (take && !d.open) {
      setTitle(defaultTitle(take.startedAt));
      d.showModal();
    }
    if (!take && d.open) d.close();
  }, [take]);

  const result = useMemo<ExportSource | null>(() => {
    if (!take) return null;
    const q = quantize(take, {
      grid: s.quantGrid,
      triplets: s.quantTriplets,
      swing: s.quantSwing,
      minNote: s.quantMinNote,
      resolveOverlaps: s.quantResolveOverlaps,
      splitPoint: s.splitPoint,
    });
    const key = estimateKey(songHistogram(q.notes))?.key ?? null;
    const tempoMap = new TempoMap(q.ppq, [{ tick: 0, bpm: q.bpm }]);
    const measures = buildMeasures(
      q.ppq,
      [{ tick: 0, numerator: q.numerator, denominator: q.denominator }],
      tempoMap,
      q.measureCount * q.measureTicks - 1,
    );
    return {
      title: title || msg().recording.fallbackTitle,
      ppq: q.ppq,
      bpm: q.bpm,
      numerator: q.numerator,
      denominator: q.denominator,
      key,
      notes: q.notes,
      score: scoreFor(q.notes, measures, q.ppq, key, tempoMap),
    };
  }, [
    take,
    title,
    s.quantGrid,
    s.quantTriplets,
    s.quantSwing,
    s.quantMinNote,
    s.quantResolveOverlaps,
    s.splitPoint,
  ]);

  // Vorschau neu setzen (entprellt)
  useEffect(() => {
    const el = previewRef.current;
    if (!el || !result) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      renderScore(el, result.score, Math.max(400, el.clientWidth))
        .then(() => !cancelled && setPreviewError(null))
        .catch((e: unknown) => !cancelled && setPreviewError(errorMessage(e)));
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [result]);

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      useApp.getState().set({ error: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('Speichern', async () => {
      if (!result) return;
      const bytes = midiBytes(result);
      useApp.getState().set({ take: null });
      await importBytes(bytes, `${result.title}.mid`, 'recording', result.title);
    });

  return (
    <dialog
      ref={ref}
      className="dialog wide recording-dialog"
      onClose={() => useApp.getState().set({ take: null })}
    >
      <h2>{t.recording.editHeading}</h2>
      {take && result && (
        <>
          <dl className="meta-row">
            <div>
              <dt>{t.common.tempo}</dt>
              <dd>{t.common.bpm(take.bpm)}</dd>
            </div>
            <div>
              <dt>{t.common.meter}</dt>
              <dd>
                {take.numerator}/{take.denominator}
              </dd>
            </div>
            <div>
              <dt>{t.common.duration}</dt>
              <dd>{formatTime(take.durationMs / 1000)}</dd>
            </div>
            <div>
              <dt>{t.common.notes}</dt>
              <dd>{result.notes.length}</dd>
            </div>
            {result.key && (
              <div>
                <dt>{t.recording.detectedKey}</dt>
                <dd>{keyName(result.key, t)}</dd>
              </div>
            )}
          </dl>

          <label className="field">
            {t.common.title}
            <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <fieldset>
            <legend>{t.recording.quantization}</legend>
            <div className="quant-grid">
              <label className="field">
                {t.recording.grid}
                <select
                  value={s.quantGrid}
                  onChange={(e) => s.update({ quantGrid: Number(e.target.value) as 4 | 8 | 16 })}
                >
                  <option value={4}>{t.recording.gridQuarter}</option>
                  <option value={8}>{t.recording.gridEighth}</option>
                  <option value={16}>{t.recording.gridSixteenth}</option>
                </select>
              </label>
              <label className="field">
                {t.recording.minNote}
                <select
                  value={s.quantMinNote}
                  onChange={(e) => s.update({ quantMinNote: Number(e.target.value) })}
                >
                  <option value={32}>1/32</option>
                  <option value={16}>1/16</option>
                  <option value={8}>1/8</option>
                  <option value={4}>1/4</option>
                </select>
              </label>
              <label className="field">
                {t.recording.swing(s.quantSwing <= 0.5 ? null : t.pct(Math.round(s.quantSwing * 100)))}
                <input
                  type="range"
                  min={0.5}
                  max={0.75}
                  step={0.01}
                  value={s.quantSwing}
                  onChange={(e) => s.update({ quantSwing: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                {t.recording.handSplit(midiToName(s.splitPoint))}
                <input
                  type="range"
                  min={36}
                  max={84}
                  value={s.splitPoint}
                  onChange={(e) => s.update({ splitPoint: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={s.quantTriplets}
                onChange={(e) => s.update({ quantTriplets: e.target.checked })}
              />
              {t.recording.triplets}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.quantResolveOverlaps}
                onChange={(e) => s.update({ quantResolveOverlaps: e.target.checked })}
              />
              {t.recording.overlaps}
            </label>
          </fieldset>

          <div className="rec-preview">
            <div ref={previewRef} className="notation-paper rec-preview-paper" />
            {previewError && <p className="warn-text">{t.recording.previewFailed(previewError)}</p>}
          </div>

          <div className="dialog-actions">
            <button className="btn" onClick={discardTake}>
              {t.recording.discard}
            </button>
            <button
              className="btn"
              onClick={() => {
                discardTake();
                void startRecording();
              }}
            >
              {t.recording.again}
            </button>
            <span className="export-group">
              {t.common.exportLabel}
              <button
                className="btn small"
                disabled={busy !== null}
                onClick={() => run('MIDI', () => exportMidi(result))}
              >
                MIDI
              </button>
              <button
                className="btn small"
                disabled={busy !== null}
                onClick={() => run('MusicXML', () => exportMusicXml(result))}
              >
                MusicXML
              </button>
              <button
                className="btn small"
                disabled={busy !== null}
                onClick={() => run('SVG', () => exportSvg(result))}
              >
                SVG
              </button>
              <button
                className="btn small"
                disabled={busy !== null}
                onClick={() => run('PNG', () => exportPng(result))}
              >
                PNG
              </button>
            </span>
            <button className="btn primary" disabled={busy !== null} onClick={() => void save()}>
              {t.recording.save}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
