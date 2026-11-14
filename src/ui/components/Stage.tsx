import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';
import { NotationView } from './NotationView';
import { StageOverlay } from './StageOverlay';

/**
 * Mittlerer Bereich: fallende Noten, Notenschrift oder beides übereinander.
 * Der Notenbereich ist nur ein Platzhalter für die Anzeigen darüber; gezeichnet wird er von der Bühne (Scene),
 * die direkt über der Klaviatur liegt (gleiche Breite = gleiche Tastenpositionen).
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
          <StageOverlay />
        </div>
      )}
    </div>
  );
}
