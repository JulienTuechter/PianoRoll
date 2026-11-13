import { useState } from 'react';
import { exportMidi, exportMusicXml, exportPng, exportSvg, type ExportSource } from '../export';
import { scoreFor } from '../notation/score-for-song';
import { live } from '../runtime';
import { useApp } from '../store/app-store';
import { useHarmony } from '../store/harmony-store';

/** Export des geladenen Stücks (MIDI, MusicXML, SVG, PNG). */
export function ExportButtons() {
  const song = useApp((s) => s.song);
  const songKey = useHarmony((s) => s.songKey);
  const [busy, setBusy] = useState(false);
  if (!song) return null;

  const source = (): ExportSource => {
    const ts = song.timeSignatures[0];
    return {
      title: song.title,
      ppq: song.ppq,
      bpm: song.tempos[0]?.bpm ?? 120,
      numerator: ts?.numerator ?? 4,
      denominator: ts?.denominator ?? 4,
      key: songKey,
      notes: live.notes,
      score: scoreFor(live.notes, live.measures, song.ppq, songKey, live.tempoMap),
    };
  };
  const run = async (fn: (s: ExportSource) => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn(source());
    } catch (e) {
      useApp.getState().set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-row">
      <span className="muted small">Export:</span>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => void run(exportMidi)}
        title="MIDI (Hände als zwei Spuren)"
      >
        MIDI
      </button>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => void run(exportMusicXml)}
        title="MusicXML für Notenprogramme"
      >
        MusicXML
      </button>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => void run(exportSvg)}
        title="Notenbild als SVG"
      >
        SVG
      </button>
      <button
        className="btn small"
        disabled={busy}
        onClick={() => void run(exportPng)}
        title="Notenbild als PNG"
      >
        PNG
      </button>
    </div>
  );
}
