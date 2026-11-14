import { midiToName } from '../../core/note-event-model/notes';
import { getLocale } from '../../i18n';
import { keySignatureName } from '../../i18n/music';
import { formatTime } from '../format';
import { useT } from '../i18n';
import { setSongSplitPoint, updateTracks } from '../runtime';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';
import { MidiStatusPanel } from './MidiStatus';
import { ExportButtons } from './ExportButtons';
import { HarmonyPanel } from './HarmonyPanel';
import { RecordingSettings } from './RecordingSettings';
import { PracticePanel, PracticeTools } from './PracticePanel';
import { Section } from './Section';

export function SidePanel() {
  const t = useT();
  const song = useApp((s) => s.song);
  const octave = useSettings((s) => s.simulatorOctave);
  const labels = useSettings((s) => s.keyboardLabels);
  // Erste Taste der unteren Reihe: QWERTZ „Y“, QWERTY „Z“
  const lowerKey = (labels === 'off' ? getLocale() : labels) === 'de' ? 'Y' : 'Z';

  return (
    <aside className="side">
      <Section id="harmony" title={t.side.sections.harmony}>
        <HarmonyPanel />
      </Section>

      <Section id="practice-mode" title={t.side.sections.practice}>
        <PracticePanel />
      </Section>

      <Section id="practice-tools" title={t.side.sections.tools}>
        <PracticeTools />
      </Section>

      {song && (
        <Section id="song" title={t.side.sections.song}>
          <dl className="facts">
            <dt>{t.common.duration}</dt>
            <dd>{formatTime(song.durationSec)}</dd>
            <dt>{t.common.tempo}</dt>
            <dd>
              {t.common.bpm(Math.round(song.tempos[0]?.bpm ?? 120))}
              {song.tempos.length > 1 ? t.side.variable : ''}
            </dd>
            <dt>{t.common.meter}</dt>
            <dd>
              {song.timeSignatures[0]?.numerator ?? 4}/{song.timeSignatures[0]?.denominator ?? 4}
            </dd>
            {song.keySignatures[0] && (
              <>
                <dt>{t.common.key}</dt>
                <dd>
                  {keySignatureName(song.keySignatures[0].key, song.keySignatures[0].scale === 'minor', t)}
                </dd>
              </>
            )}
          </dl>

          <h3>{t.side.tracks}</h3>
          <ul className="tracks">
            {song.tracks
              .filter((tr) => tr.noteCount > 0)
              .map((tr) => (
                <li key={tr.index} className={tr.enabled ? '' : 'disabled'}>
                  <label className="track-enable" title={t.side.useTrack}>
                    <input
                      type="checkbox"
                      checked={tr.enabled}
                      onChange={(e) =>
                        updateTracks(
                          song.tracks.map((x) =>
                            x.index === tr.index ? { ...x, enabled: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span className="track-name">{tr.name}</span>
                  </label>
                  <span className="track-meta">
                    {t.common.noteCount(tr.noteCount)}
                    {tr.isPercussion ? `, ${t.side.drums}` : ''}
                  </span>
                  <div className="seg" role="group" aria-label={t.side.handFor(tr.name)}>
                    {(['left', 'split', 'right'] as const).map((h) => (
                      <button
                        key={h}
                        className={tr.handAssignment === h ? 'on' : ''}
                        onClick={() =>
                          updateTracks(
                            song.tracks.map((x) => (x.index === tr.index ? { ...x, handAssignment: h } : x)),
                          )
                        }
                      >
                        {t.hands[h]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
          {song.tracks.some((tr) => tr.enabled && tr.handAssignment === 'split') && (
            <label className="field">
              {t.side.splitPoint(midiToName(song.splitPoint))}
              <input
                type="range"
                min={36}
                max={84}
                value={song.splitPoint}
                onChange={(e) => setSongSplitPoint(Number(e.target.value))}
                onKeyDown={(e) => e.preventDefault()}
              />
            </label>
          )}
          <ExportButtons />
          <div className="legend">
            <span className="swatch left" /> {t.common.leftHand} <span className="swatch right" />{' '}
            {t.common.rightHand}
          </div>
        </Section>
      )}

      <Section id="recording" title={t.side.sections.recording}>
        <RecordingSettings />
      </Section>

      <Section id="midi" title={t.side.sections.midi}>
        <MidiStatusPanel />
      </Section>

      <Section id="simulator" title={t.side.sections.simulator} defaultOpen={false}>
        <p className="help">
          {t.side.simLower} <kbd>{lowerKey}</kbd> = {midiToName((octave + 1) * 12)}, {t.side.simUpper}{' '}
          <kbd>Q</kbd> = {midiToName((octave + 2) * 12)}. {t.side.simBlack} <kbd>Shift</kbd> ={' '}
          {t.side.simPedal}, <kbd>-</kbd>/<kbd>+</kbd> = {t.side.simOctave}. {t.side.simMouse}
        </p>
      </Section>
    </aside>
  );
}
