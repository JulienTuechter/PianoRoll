import type { HandAssignment } from '../../core/note-event-model/types';
import { midiToName } from '../../core/note-event-model/notes';
import { formatTime } from '../format';
import { setSongSplitPoint, updateTracks } from '../runtime';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';
import { MidiStatusPanel } from './MidiStatus';
import { ExportButtons } from './ExportButtons';
import { HarmonyPanel } from './HarmonyPanel';
import { RecordingSettings } from './RecordingSettings';
import { PracticePanel, PracticeTools } from './PracticePanel';
import { Section } from './Section';

const HAND_LABEL: Record<HandAssignment, string> = { left: 'Links', right: 'Rechts', split: 'Split' };

export function SidePanel() {
  const song = useApp((s) => s.song);
  const octave = useSettings((s) => s.simulatorOctave);

  return (
    <aside className="side">
      <Section id="harmony" title="Harmony Assist">
        <HarmonyPanel />
      </Section>

      <Section id="practice-mode" title="Übung">
        <PracticePanel />
      </Section>

      <Section id="practice-tools" title="Practice">
        <PracticeTools />
      </Section>

      {song && (
        <Section id="song" title="Stück">
          <dl className="facts">
            <dt>Dauer</dt>
            <dd>{formatTime(song.durationSec)}</dd>
            <dt>Tempo</dt>
            <dd>
              {Math.round(song.tempos[0]?.bpm ?? 120)} BPM{song.tempos.length > 1 ? ' (variabel)' : ''}
            </dd>
            <dt>Takt</dt>
            <dd>
              {song.timeSignatures[0]?.numerator ?? 4}/{song.timeSignatures[0]?.denominator ?? 4}
            </dd>
            {song.keySignatures[0] && (
              <>
                <dt>Tonart</dt>
                <dd>
                  {song.keySignatures[0].key}-{song.keySignatures[0].scale === 'minor' ? 'Moll' : 'Dur'}
                </dd>
              </>
            )}
          </dl>

          <h3>Spuren &amp; Hände</h3>
          <ul className="tracks">
            {song.tracks
              .filter((t) => t.noteCount > 0)
              .map((t) => (
                <li key={t.index} className={t.enabled ? '' : 'disabled'}>
                  <label className="track-enable" title="Spur verwenden">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={(e) =>
                        updateTracks(
                          song.tracks.map((x) =>
                            x.index === t.index ? { ...x, enabled: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span className="track-name">{t.name}</span>
                  </label>
                  <span className="track-meta">
                    {t.noteCount} Noten{t.isPercussion ? ' · Drums' : ''}
                  </span>
                  <div className="seg" role="group" aria-label={`Hand für ${t.name}`}>
                    {(['left', 'split', 'right'] as const).map((h) => (
                      <button
                        key={h}
                        className={t.handAssignment === h ? 'on' : ''}
                        onClick={() =>
                          updateTracks(
                            song.tracks.map((x) => (x.index === t.index ? { ...x, handAssignment: h } : x)),
                          )
                        }
                      >
                        {HAND_LABEL[h]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
          {song.tracks.some((t) => t.enabled && t.handAssignment === 'split') && (
            <label className="field">
              Split-Punkt: {midiToName(song.splitPoint)} (tiefer = links)
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
            <span className="swatch left" /> Linke Hand <span className="swatch right" /> Rechte Hand
          </div>
        </Section>
      )}

      <Section id="recording" title="Aufnahme">
        <RecordingSettings />
      </Section>

      <Section id="midi" title="MIDI">
        <MidiStatusPanel />
      </Section>

      <Section id="simulator" title="Simulator" defaultOpen={false}>
        <p className="help">
          Untere Buchstabenreihe ab <kbd>Y</kbd> = {midiToName((octave + 1) * 12)}, obere Reihe ab{' '}
          <kbd>Q</kbd> = {midiToName((octave + 2) * 12)}. Schwarze Tasten in der Reihe darüber.{' '}
          <kbd>Shift</kbd> = Pedal, <kbd>-</kbd>/<kbd>+</kbd> = Oktave. Oder mit der Maus auf die Klaviatur
          klicken.
        </p>
      </Section>
    </aside>
  );
}
