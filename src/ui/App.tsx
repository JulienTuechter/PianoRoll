import { useEffect } from 'react';
import { DropZone } from './components/DropZone';
import { ErrorToast } from './components/ErrorToast';
import { LibraryDialog } from './components/Library';
import { Stage } from './components/Stage';
import { MeasureTimeline } from './components/MeasureTimeline';
import { Onboarding } from './components/Onboarding';
import { PianoKeyboard } from './components/PianoKeyboard';
import { RecordingDialog } from './components/RecordingDialog';
import { ResultsDialog } from './components/ResultsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SidePanel } from './components/SidePanel';
import { TransportBar } from './components/TransportBar';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { startFreeMetronome } from './free-metronome';
import { startHarmony } from './harmony-service';
import { startRuntime } from './runtime';
import { useApp } from './store/app-store';
import { useSettings } from './store/settings';

export function App() {
  const dialogOpen = useApp((s) => s.settingsOpen || s.libraryOpen || s.resultsOpen || s.take !== null);
  const ready = useApp((s) => s.ready);
  const onboardingDone = useSettings((s) => s.onboardingDone);
  const activeDeviceId = useApp((s) => s.midi.activeDeviceId);

  useEffect(() => startRuntime(), []);
  useEffect(() => startHarmony(), []);
  useEffect(() => startFreeMetronome(), []);
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
          <Stage />
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
      <RecordingDialog />
      {ready && <Onboarding />}
    </div>
  );
}
