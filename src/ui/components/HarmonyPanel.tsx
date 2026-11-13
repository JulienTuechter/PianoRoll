import { useEffect, useState } from 'react';
import { describeChord } from '../../core/chord-detection/chord';
import { segmentIndexAt, type ChordSegment } from '../../core/chord-detection/song-chords';
import { alternativesFor, romanFor, voiceChord } from '../../core/harmony-suggestions/harmony';
import { allKeys, keyLabel, sameKey, type MusicalKey } from '../../core/key-detection/key';
import { showGhost, togglePin } from '../harmony-service';
import { transport } from '../runtime';
import { useApp } from '../store/app-store';
import { useHarmony, type SuggestionChip } from '../store/harmony-store';
import { useSettings } from '../store/settings';

function keyValue(k: MusicalKey | null): string {
  return k ? `${k.tonicPc}-${k.mode}` : 'auto';
}

function Chip({ chip, id }: { chip: SuggestionChip; id: string }) {
  const pinned = useHarmony((s) => s.pinned === id);
  return (
    <button
      className={`chord-chip fn-${chip.fn}${pinned ? ' pinned' : ''}`}
      onMouseEnter={() => showGhost({ bass: chip.bass, upper: chip.upper })}
      onMouseLeave={() => {
        const p = useHarmony.getState().pinned;
        if (p === null) showGhost(null);
        else if (p !== id) {
          // angepinnten Vorschlag wieder zeigen
          const other = [...document.querySelectorAll<HTMLElement>('.chord-chip.pinned')][0];
          if (!other) showGhost(null);
        }
      }}
      onFocus={() => showGhost({ bass: chip.bass, upper: chip.upper })}
      onClick={() => togglePin(chip, id)}
      title={`${chip.symbol} (${chip.numeral}) – ${Math.round(chip.probability * 100)} % · Klick: anpinnen${useSettings.getState().harmonyAudition ? ' und anspielen' : ''}`}
      aria-pressed={pinned}
    >
      <span className="chip-symbol">{chip.symbol}</span>
      <span className="chip-numeral">{chip.numeral}</span>
      <span className="chip-bar" style={{ width: `${Math.round(chip.probability * 100)}%` }} />
    </button>
  );
}

function toChip(seg: ChordSegment, key: MusicalKey): SuggestionChip | null {
  const c = seg.chord;
  if (!c) return null;
  const sc = romanFor(c, key);
  const v = voiceChord(c.rootPc, c.pcs);
  return {
    numeral: sc?.numeral ?? '–',
    symbol: c.symbol,
    root: c.root,
    rootPc: c.rootPc,
    cls: sc?.cls ?? 'maj',
    fn: sc?.fn ?? 'tonic',
    pcs: c.pcs,
    probability: 1,
    bass: 36 + (c.bassPc % 12),
    upper: v.upper,
  };
}

/** A) Freispiel */
function FreePlay() {
  const { chord, chordSounding, chordNumeral, key, keySource, keyConfidence, suggestions } = useHarmony();
  const s = useSettings();

  return (
    <div className="harmony-free">
      <div className={`chord-now${chordSounding ? ' sounding' : ''}`}>
        <span className="chord-symbol">{chord ? chord.symbol : '–'}</span>
        {chord && chordNumeral && <span className="chord-numeral">{chordNumeral}</span>}
      </div>
      <p className="help chord-desc">
        {chord ? describeChord(chord) : 'Spiele mindestens drei Töne gleichzeitig.'}
        {chord && !chordSounding && ' · zuletzt gespielt'}
      </p>

      <label className="field">
        <span>
          Tonart{' '}
          {key && (
            <strong className="key-name">
              {keyLabel(key)}
              {keySource === 'auto' && (
                <span className="muted">
                  {' '}
                  ({keyConfidence > 0.5 ? 'eindeutig' : keyConfidence > 0.15 ? 'wahrscheinlich' : 'unsicher'})
                </span>
              )}
              {keySource === 'song' && <span className="muted"> (aus dem Stück)</span>}
            </strong>
          )}
          {!key && <span className="muted">– spiel ein paar Takte</span>}
        </span>
        <select
          value={keyValue(s.harmonyKey)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'auto') s.update({ harmonyKey: null });
            else {
              const [p, mode] = v.split('-');
              s.update({ harmonyKey: { tonicPc: Number(p), mode: mode === 'minor' ? 'minor' : 'major' } });
            }
          }}
          aria-label="Tonart"
        >
          <option value="auto">Automatisch (letzte ~8 s)</option>
          {allKeys().map((k) => (
            <option key={keyValue(k)} value={keyValue(k)}>
              {keyLabel(k)}
            </option>
          ))}
        </select>
      </label>

      {suggestions.length > 0 && (
        <>
          <div className="chips-head">Als Nächstes {chord ? `nach ${chord.symbol}` : 'in der Tonart'}</div>
          <div
            className="chips"
            onMouseLeave={() => useHarmony.getState().pinned === null && showGhost(null)}
          >
            {suggestions.map((c) => (
              <Chip key={`free-${c.numeral}`} chip={c} id={`free-${c.numeral}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** B) Akkorde im Stück */
function InSong() {
  const segments = useHarmony((s) => s.segments);
  const songKey = useHarmony((s) => s.songKey);
  const [idx, setIdx] = useState(-1);

  useEffect(() => {
    const id = setInterval(() => setIdx(segmentIndexAt(segments, Math.max(0, transport.position))), 150);
    return () => clearInterval(id);
  }, [segments]);

  if (!songKey || segments.length === 0) return <p className="help">Keine Akkorde erkannt.</p>;
  const cur = segments[Math.max(0, idx)];
  const nextIdx = segments.findIndex((s, i) => i > idx && s.chord !== null);
  const next = nextIdx >= 0 ? segments[nextIdx] : undefined;
  const curChip = cur ? toChip(cur, songKey) : null;
  const nextChip = next ? toChip(next, songKey) : null;
  const toChips = (seg: ChordSegment | undefined): SuggestionChip[] =>
    seg
      ? alternativesFor(seg.weights, seg.chord, songKey).map((a) => {
          const v = voiceChord(a.rootPc, a.pcs);
          return { ...a, bass: v.bass, upper: v.upper };
        })
      : [];
  const curAlt = toChips(cur);
  const nextAlt = toChips(next);

  return (
    <div className="harmony-song">
      <p className="help">
        Tonart des Stücks: <strong>{keyLabel(songKey)}</strong>
      </p>
      <div className="song-chords">
        <div>
          <div className="chips-head">Jetzt</div>
          {curChip ? <Chip chip={curChip} id={`cur-${idx}`} /> : <span className="muted">–</span>}
        </div>
        <div>
          <div className="chips-head">Als Nächstes{next ? ` · Takt ${next.measure + 1}` : ''}</div>
          {nextChip ? (
            <Chip chip={nextChip} id={`next-${nextIdx}`} />
          ) : (
            <span className="muted">Schluss</span>
          )}
        </div>
      </div>
      {curAlt.length > 0 && (
        <>
          <div className="chips-head tip">Tipp: Statt {curChip?.symbol} würde hier auch passen</div>
          <div className="chips">
            {curAlt.map((c) => (
              <Chip key={`ca-${idx}-${c.symbol}`} chip={c} id={`ca-${idx}-${c.symbol}`} />
            ))}
          </div>
        </>
      )}
      {nextAlt.length > 0 && (
        <>
          <div className="chips-head">Alternativen zu {nextChip?.symbol}</div>
          <div className="chips">
            {nextAlt.map((c) => (
              <Chip key={`na-${nextIdx}-${c.symbol}`} chip={c} id={`na-${nextIdx}-${c.symbol}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function HarmonyPanel() {
  const s = useSettings();
  const song = useApp((a) => a.song);
  const playing = useApp((a) => a.transport === 'playing');
  const freeVisible = s.harmonyFree && (!song || !playing);
  const songVisible = s.harmonySong && song !== null;
  const songKey = useHarmony((h) => h.songKey);
  const key = useHarmony((h) => h.key);

  // Ghost-Notes beim Ausblenden entfernen
  useEffect(() => {
    if (!freeVisible && !songVisible) {
      useHarmony.getState().set({ pinned: null });
      showGhost(null);
    }
  }, [freeVisible, songVisible]);

  return (
    <div className="harmony">
      <div className="harmony-switches">
        <label className="check">
          <input
            type="checkbox"
            checked={s.harmonyFree}
            onChange={(e) => s.update({ harmonyFree: e.target.checked })}
          />
          Freispiel-Vorschläge
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.harmonySong}
            onChange={(e) => s.update({ harmonySong: e.target.checked })}
          />
          Akkorde im Stück
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.harmonyScaleTones}
            onChange={(e) => s.update({ harmonyScaleTones: e.target.checked })}
          />
          Skalentöne markieren
        </label>
      </div>
      {s.harmonyFree && song && playing && (
        <p className="help">Freispiel-Vorschläge erscheinen, wenn das Stück pausiert.</p>
      )}
      {freeVisible && <FreePlay />}
      {songVisible && (
        <>
          {freeVisible && <hr className="sep" />}
          <InSong />
        </>
      )}
      {key && songKey && freeVisible && songVisible && !sameKey(key, songKey) && (
        <p className="help">
          Hinweis: Dein Spiel klingt nach {keyLabel(key)}, das Stück steht in {keyLabel(songKey)}.
        </p>
      )}
    </div>
  );
}
