import { describeChord } from '../../core/chord-detection/chord';
import { keyLabel } from '../../core/key-detection/key';
import { showGhost } from '../harmony-service';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { Chip } from './HarmonyPanel';

/** Harmonie-Leiste oben auf der Bühne (freies Spiel): Akkord groß, darunter Tonart und Folgeakkorde. */
export function HarmonyBar() {
  const enabled = useSettings((s) => s.harmonyFree);
  const { chord, chordSounding, chordNumeral, key, suggestions } = useHarmony();
  if (!enabled) return null;
  return (
    <div className={`harmony-bar${chordSounding ? ' sounding' : ''}`}>
      <div className="hb-chord">
        {chord ? (
          <span className="hb-symbol">{chord.symbol}</span>
        ) : (
          <span className="hb-symbol hb-empty" aria-label="Noch kein Akkord" />
        )}
        {chordNumeral && <span className="chord-numeral">{chordNumeral}</span>}
      </div>
      <div className="hb-meta">
        {key ? <strong>{keyLabel(key)}</strong> : <span>Tonart: spiel ein paar Takte</span>}
        {chord && <span>{describeChord(chord)}</span>}
        {chord && !chordSounding && <span>zuletzt gespielt</span>}
        {!chord && key && <span>Spiele mindestens drei Töne gleichzeitig</span>}
      </div>
      {suggestions.length > 0 && (
        <div className="hb-next">
          <span className="hb-label">Als Nächstes</span>
          <div
            className="chips"
            onMouseLeave={() => useHarmony.getState().pinned === null && showGhost(null)}
          >
            {suggestions.map((c) => (
              <Chip key={`bar-${c.numeral}`} chip={c} id={`bar-${c.numeral}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
