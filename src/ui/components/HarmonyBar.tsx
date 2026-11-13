import { keyLabel } from '../../core/key-detection/key';
import { showGhost } from '../harmony-service';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { Chip } from './HarmonyPanel';

/** Harmonie-Leiste direkt über der Klaviatur (freies Spiel): Akkord, Tonart, Folgeakkorde. */
export function HarmonyBar() {
  const enabled = useSettings((s) => s.harmonyFree);
  const { chord, chordSounding, chordNumeral, key, suggestions } = useHarmony();
  if (!enabled) return null;
  return (
    <div className="harmony-bar">
      <div className={`hb-chord${chordSounding ? ' sounding' : ''}`}>
        <span className="hb-symbol">{chord ? chord.symbol : '–'}</span>
        {chordNumeral && <span className="chord-numeral">{chordNumeral}</span>}
      </div>
      <div className="hb-key">{key ? keyLabel(key) : 'Tonart: spiel ein paar Takte'}</div>
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
