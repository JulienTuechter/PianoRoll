import { useEffect } from 'react';
import { DropZone } from './components/DropZone';
import { ErrorToast } from './components/ErrorToast';
import { FallingNotes } from './components/FallingNotes';
import { LibraryDialog } from './components/Library';
import { MeasureTimeline } from './components/MeasureTimeline';
import { Onboarding } from './components/Onboarding';
import { PianoKeyboard } from './components/PianoKeyboard';
import { ResultsDialog } from './components/ResultsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SidePanel } from './components/SidePanel';
import { StageOverlay } from './components/StageOverlay';
import { TransportBar } from './components/TransportBar';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { startHarmony } from './harmony-service';
import { startRuntime } from './runtime';
import { useApp } from './store/app-store';
import { useSettings } from './store/settings';

export function App() {
  const dialogOpen = useApp((s) => s.settingsOpen || s.libraryOpen || s.resultsOpen);
  const ready = useApp((s) => s.ready);
  const onboardingDone = useSettings((s) => s.onboardingDone);
  const activeDeviceId = useApp((s) => s.midi.activeDeviceId);

  useEffect(() => startRuntime(), []);
  useEffect(() => startHarmony(), []);
  // Shortcuts/Simulator nicht aktiv, während ein Dialog offen ist
  useKeyboardInput(ready && !dialogOpen && onboardingDone);

  // Automatisch gewähltes Gerät merken
  useEffect(() => {
    const s = useSettings.getState();
    if (activeDeviceId && !s.midiDeviceId) s.update({ midiDeviceId: activeDeviceId });
  }, [activeDeviceId]);

  return (
    <div className="app">
      <TransportBar />
      <MeasureTimeline />
      <main className="main">
        {/* Falling Notes und Klaviatur teilen sich exakt dieselbe Breite */}
        <div className="stage-col">
          <div className="stage">
            <FallingNotes />
            <StageOverlay />
          </div>
          <div className="keyboard-wrap">
            <PianoKeyboard />
          </div>
        </div>
        <SidePanel />
      </main>
      <DropZone />
      <ErrorToast />
      <SettingsDialog />
      <LibraryDialog />
      <ResultsDialog />
      {ready && <Onboarding />}
    </div>
  );
}
