import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';
import { FallingNotes } from './FallingNotes';
import { NotationView } from './NotationView';
import { StageOverlay } from './StageOverlay';

/**
 * Mittlerer Bereich: fallende Noten, Notenschrift oder beides übereinander.
 * Die fallenden Noten bleiben immer direkt über der Klaviatur (gleiche Breite = gleiche Tastenpositionen).
 */
export function Stage() {
  const song = useApp((s) => s.song);
  const view = useSettings((s) => s.view);
  const showNotation = song !== null && view !== 'falling';
  const showFalling = song === null || view !== 'notation';
  return (
    <div className={`stage view-${song ? view : 'falling'}`}>
      {showNotation && (
        <div className="notation-pane">
          <NotationView />
          {!showFalling && <StageOverlay />}
        </div>
      )}
      {showFalling && (
        <div className="falling-pane">
          <FallingNotes />
          <StageOverlay />
        </div>
      )}
    </div>
  );
}
