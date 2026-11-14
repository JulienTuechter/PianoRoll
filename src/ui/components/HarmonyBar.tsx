import { chordDescription, keyName } from '../../i18n/music';
import { showGhost } from '../harmony-service';
import { useT } from '../i18n';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { Chip } from './HarmonyPanel';

/** Harmonie-Leiste oben auf der Bühne (freies Spiel): Akkord groß, darunter Tonart und Folgeakkorde. */
export function HarmonyBar() {
  const t = useT();
  const enabled = useSettings((s) => s.harmonyFree);
  const { chord, chordSounding, chordNumeral, key, suggestions } = useHarmony();
  if (!enabled) return null;
  return (
    <div className={`harmony-bar${chordSounding ? ' sounding' : ''}`}>
      <div className="hb-chord">
        {chord ? (
          <span className="hb-symbol">{chord.symbol}</span>
        ) : (
          <span className="hb-symbol hb-empty" aria-label={t.harmony.noChord} />
        )}
        {chordNumeral && <span className="chord-numeral">{chordNumeral}</span>}
      </div>
      <div className="hb-meta">
        {key ? <strong>{keyName(key, t)}</strong> : <span>{t.harmony.keyUnknown}</span>}
        {chord && <span>{chordDescription(chord, t)}</span>}
        {chord && !chordSounding && <span>{t.harmony.lastPlayed}</span>}
        {!chord && key && <span>{t.harmony.playThree}</span>}
      </div>
      {suggestions.length > 0 && (
        <div className="hb-next">
          <span className="hb-label">{t.harmony.next}</span>
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
