import { useApp } from '../store/app-store';
import { LibraryList } from './Library';
import { PlayHud } from './PlayHud';

/** Über den fallenden Noten: ohne Stück die Bibliothek, sonst Spielanzeige und Count-in. */
export function StageOverlay() {
  const song = useApp((s) => s.song);
  const ready = useApp((s) => s.ready);
  if (!ready) return null;
  if (!song) {
    return (
      <div className="stage-empty">
        <div className="stage-empty-inner">
          <h2>Was möchtest du üben?</h2>
          <LibraryList />
        </div>
      </div>
    );
  }
  return <PlayHud />;
}
