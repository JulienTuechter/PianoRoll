import { useEffect } from 'react';
import { DropZone } from './components/DropZone';
import { ErrorToast } from './components/ErrorToast';
import { HistoryDialog } from './components/HistoryDialog';
import { LibraryDialog } from './components/Library';
import { Stage } from './components/Stage';
import { MeasureTimeline } from './components/MeasureTimeline';
import { Onboarding } from './components/Onboarding';
import { OfflineToast } from './components/OfflineToast';
import { PianoKeyboard } from './components/PianoKeyboard';
import { Scene } from './components/Scene';
import { RecordingDialog } from './components/RecordingDialog';
import { ResultsDialog } from './components/ResultsDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SidePanel } from './components/SidePanel';
import { TransportBar } from './components/TransportBar';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { useImmersive } from './hooks/useImmersive';
import { useLocaleSync } from './i18n';
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
  const panelOpen = useSettings((s) => s.sidePanelOpen);
  const immersive = useImmersive();

  useLocaleSync();
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
    <div className={`app${immersive ? ' immersive' : ''}${panelOpen ? ' panel-open' : ''}`}>
      <TransportBar />
      <MeasureTimeline />
      <main className="main">
        {/* Notenbereich und Klaviatur teilen sich exakt dieselbe Breite; die Bühne zeichnet beide */}
        <div className="stage-col">
          <Scene />
          <Stage />
          <div className="keyboard-wrap">
            <PianoKeyboard />
          </div>
        </div>
        <SidePanel />
      </main>
      <DropZone />
      <ErrorToast />
      <OfflineToast />
      <SettingsDialog />
      <LibraryDialog />
      <ResultsDialog />
      <HistoryDialog />
      <RecordingDialog />
      {ready && <Onboarding />}
    </div>
  );
}
