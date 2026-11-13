import { useEffect, useMemo, useRef, useState } from 'react';
import { songHistogram } from '../../core/chord-detection/song-chords';
import { keyLabel } from '../../core/key-detection/key';
import { estimateKey } from '../../core/key-detection/krumhansl';
import { buildMeasures, TempoMap } from '../../core/note-event-model/tempo-map';
import { midiToName } from '../../core/note-event-model/notes';
import { quantize } from '../../core/quantizer/quantizer';
import { exportMidi, exportMusicXml, exportPng, exportSvg, midiBytes, type ExportSource } from '../export';
import { formatTime } from '../format';
import { renderScore } from '../notation/render-score';
import { scoreFor } from '../notation/score-for-song';
import { discardTake, startRecording } from '../recording';
import { importBytes } from '../runtime';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

function defaultTitle(startedAt: number): string {
  const d = new Date(startedAt);
  return `Aufnahme ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Aufnahme bearbeiten: Quantisierung einstellen, Notenvorschau prüfen, exportieren oder in die Bibliothek speichern. */
export function RecordingDialog() {
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
      title: title || 'Aufnahme',
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
        .catch((e: unknown) => !cancelled && setPreviewError(e instanceof Error ? e.message : String(e)));
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
      useApp.getState().set({ error: e instanceof Error ? e.message : String(e) });
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
      <h2>Aufnahme bearbeiten</h2>
      {take && result && (
        <>
          <p className="muted">
            {take.bpm} BPM · {take.numerator}/{take.denominator} · {formatTime(take.durationMs / 1000)} ·{' '}
            {result.notes.length} Noten{result.key ? ` · erkannte Tonart ${keyLabel(result.key)}` : ''}
          </p>

          <label className="field">
            Titel
            <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <fieldset>
            <legend>Quantisierung</legend>
            <div className="quant-grid">
              <label className="field">
                Raster
                <select
                  value={s.quantGrid}
                  onChange={(e) => s.update({ quantGrid: Number(e.target.value) as 4 | 8 | 16 })}
                >
                  <option value={4}>Viertel (1/4)</option>
                  <option value={8}>Achtel (1/8)</option>
                  <option value={16}>Sechzehntel (1/16)</option>
                </select>
              </label>
              <label className="field">
                Mindestnotenlänge
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
                Swing-Toleranz: {s.quantSwing <= 0.5 ? 'gerade' : `${Math.round(s.quantSwing * 100)} %`}
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
                Hände-Trennung: {midiToName(s.splitPoint)}
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
              Triolen erkennen
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={s.quantResolveOverlaps}
                onChange={(e) => s.update({ quantResolveOverlaps: e.target.checked })}
              />
              Überlappungen auflösen (Legato am nächsten Anschlag abschneiden)
            </label>
          </fieldset>

          <div className="rec-preview">
            <div ref={previewRef} className="notation-paper rec-preview-paper" />
            {previewError && <p className="warn-text">Vorschau fehlgeschlagen: {previewError}</p>}
          </div>

          <div className="dialog-actions">
            <button className="btn" onClick={discardTake}>
              Verwerfen
            </button>
            <button
              className="btn"
              onClick={() => {
                discardTake();
                void startRecording();
              }}
            >
              Neu aufnehmen
            </button>
            <span className="export-group">
              Export:
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
              In Bibliothek speichern &amp; üben
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
