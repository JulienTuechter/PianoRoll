import { useApp } from '../store/app-store';
import { HarmonyBar } from './HarmonyBar';
import { LibraryList } from './Library';
import { PlayHud } from './PlayHud';
import { RecordingOverlay } from './RecordingOverlay';

/**
 * Über dem Notenbereich: ohne Stück die Bibliothek als Startansicht (verschwindet beim ersten Anschlag
 * oder per „Frei spielen“) bzw. im freien Spiel die Harmonie-Leiste; mit Stück Spielanzeige und Count-in.
 */
export function StageOverlay() {
  const song = useApp((s) => s.song);
  const ready = useApp((s) => s.ready);
  const freePlay = useApp((s) => s.freePlay);
  const set = useApp((s) => s.set);
  const recording = useApp((s) => s.recording);
  if (!ready) return null;
  if (!song) {
    if (recording)
      return (
        <>
          <HarmonyBar />
          <RecordingOverlay />
        </>
      );
    if (freePlay) return <HarmonyBar />;
    return (
      <div className="stage-empty">
        <div className="stage-empty-inner">
          <div className="stage-empty-head">
            <h2>Was möchtest du üben?</h2>
            <button className="btn" onClick={() => set({ freePlay: true })}>
              Frei spielen
            </button>
          </div>
          <LibraryList />
          <p className="muted small">
            Spiel einfach los: diese Ansicht verschwindet beim ersten Ton. Die Bibliothek erreichst du
            jederzeit oben.
          </p>
        </div>
      </div>
    );
  }
  return <PlayHud />;
}
