import { useEffect, useRef, useState } from 'react';
import { midiToName } from '../../core/note-event-model/notes';
import { hub } from '../runtime';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';
import { MidiStatusPanel } from './MidiStatus';

/** MIDI-Setup-Assistent beim ersten Start. */
export function Onboarding() {
  const t = useT();
  const done = useSettings((s) => s.onboardingDone);
  const update = useSettings((s) => s.update);
  const status = useApp((s) => s.midi.status.kind);
  const [heard, setHeard] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!done && !d.open) d.showModal();
    if (done && d.open) d.close();
  }, [done]);

  useEffect(() => {
    if (done) return;
    return hub.subscribe((e) => {
      if (e.type === 'noteon' && e.source === 'midi') setHeard(e.midi);
    });
  }, [done]);

  const steps = [
    { label: t.onboarding.stepPower, ok: true },
    { label: t.onboarding.stepCable, ok: status === 'ready' },
    { label: t.onboarding.stepKey, ok: heard !== null },
  ];

  return (
    <dialog ref={ref} className="dialog onboarding" onCancel={(e) => e.preventDefault()}>
      <h2>{t.onboarding.heading}</h2>
      <p>{t.onboarding.intro}</p>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={i} className={s.ok ? 'ok' : ''}>
            <span className="step-mark">
              {s.ok ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            {s.label}
          </li>
        ))}
      </ol>
      <MidiStatusPanel />
      {heard !== null && <p className="success">{t.onboarding.received(midiToName(heard))}</p>}
      <div className="dialog-actions">
        <button className="btn" onClick={() => update({ onboardingDone: true })}>
          {t.onboarding.simulator}
        </button>
        <button
          className="btn primary"
          disabled={heard === null}
          onClick={() => update({ onboardingDone: true })}
        >
          {t.onboarding.start}
        </button>
      </div>
    </dialog>
  );
}
