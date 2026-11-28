// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoMidi } from '../../core/demo/demo-song';
import type { Recording } from '../../core/recorder/recorder';
import type { RunResult } from '../../core/scoring/scoring';
import { setLocale } from '../../i18n';

vi.mock('../../core/audio-engine/tone-engine', () => {
  class FakeAudio {
    ready = true;
    usingFallback = false;
    clicks: number[] = [];
    resume() {
      return Promise.resolve();
    }
    click(_accent: boolean, delaySec: number) {
      this.clicks.push(delaySec);
    }
    noteOn() {}
    noteOff() {}
    playNote() {}
    setSustain() {}
    allNotesOff() {}
    setVolume() {}
    setMuted() {}
  }
  return { ToneAudioEngine: FakeAudio };
});

vi.mock('../library-repo', async () => {
  const { MemoryLibraryRepository } = await import('../../core/library/memory-repository');
  return { libraryRepo: new MemoryLibraryRepository() };
});

const rt = await import('../runtime');
const { useApp } = await import('../store/app-store');
const { defaultSettings, settingsHydrated, useSettings } = await import('../store/settings');
const { libraryRepo } = await import('../library-repo');
const { SettingsDialog } = await import('./SettingsDialog');
const { LatencyCalibration } = await import('./LatencyCalibration');
const { Onboarding } = await import('./Onboarding');
const { ResultsDialog } = await import('./ResultsDialog');
const { LibraryDialog } = await import('./Library');
const { RecordingDialog } = await import('./RecordingDialog');
const { OfflineToast } = await import('./OfflineToast');

beforeAll(async () => {
  // jsdom kennt <dialog> nur teilweise: showModal/close nachrüsten
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  await settingsHydrated();
  setLocale('de');
});

beforeEach(() => {
  useSettings.getState().update({ ...defaultSettings, locale: 'de', onboardingDone: true });
  useApp.getState().set({
    settingsOpen: false,
    libraryOpen: false,
    resultsOpen: false,
    lastResult: null,
    take: null,
    offline: 'idle',
    error: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Einstellungen', () => {
  it('öffnet sich über den Store und schließt wieder', () => {
    render(<SettingsDialog />);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(false);
    act(() => useApp.getState().set({ settingsOpen: true }));
    expect(dialog.open).toBe(true);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Schließen' }).at(-1)!);
    expect(useApp.getState().settingsOpen).toBe(false);
  });

  it('schaltet Zeichen der Notenschrift und schreibt Einstellungen', () => {
    useApp.getState().set({ settingsOpen: true });
    render(<SettingsDialog />);
    fireEvent.click(screen.getByLabelText('Akkordsymbole über dem System'));
    fireEvent.click(screen.getByLabelText('Pedalzeichen (aus der Datei bzw. Aufnahme)'));
    expect(useSettings.getState().notationChords).toBe(false);
    expect(useSettings.getState().notationPedal).toBe(false);
    expect(useSettings.getState().notationDynamics).toBe(true);

    const latency = screen.getByText(/Latenzausgleich: 0 ms/).querySelector('input')!;
    fireEvent.change(latency, { target: { value: '35' } });
    expect(useSettings.getState().latencyMs).toBe(35);
    expect(latency.max).toBe('200');
  });

  it('setzt beim Zurücksetzen alles außer Sprache und Gerät zurück', () => {
    useSettings.getState().update({ latencyMs: 80, midiDeviceId: 'dev-1', notationChords: false });
    useApp.getState().set({ settingsOpen: true });
    render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    const s = useSettings.getState();
    expect(s.latencyMs).toBe(0);
    expect(s.notationChords).toBe(true);
    expect(s.midiDeviceId).toBe('dev-1');
    expect(s.onboardingDone).toBe(true);
  });
});

describe('Latenz-Messtest', () => {
  const BEAT = 600;
  const start = async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'],
    });
    render(<LatencyCalibration />);
    const t0 = performance.now();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Latenz messen' }));
    });
    expect(screen.getByText(/Einzählen/)).toBeTruthy();
    return t0 + 400; // erster Klick
  };
  const advanceTo = (ms: number) => act(() => vi.advanceTimersByTime(Math.max(0, ms - performance.now())));

  it('misst den Versatz der Anschläge und übernimmt ihn', async () => {
    const first = await start();
    for (let k = 0; k < 16; k++) {
      advanceTo(first + (4 + k) * BEAT + 47);
      act(() => {
        rt.hub.emit({ type: 'noteon', midi: 60, velocity: 0.5, timeMs: performance.now(), source: 'midi' });
        rt.hub.emit({ type: 'noteoff', midi: 60, timeMs: performance.now() + 100, source: 'midi' });
      });
    }
    advanceTo(first + 20 * BEAT);
    // 20 Klicks (4 Einzählen + 16), mit Vorlauf eingeplant
    expect((rt.audio as unknown as { clicks: number[] }).clicks.length).toBeGreaterThanOrEqual(20);
    expect(screen.getByText(/im Mittel 47 ms nach dem Klick/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '45 ms übernehmen' }));
    expect(useSettings.getState().latencyMs).toBe(45);
    expect(screen.getByRole('button', { name: 'Latenz messen' })).toBeTruthy();
  });

  // jsdom setzt timeStamp auf Date.now(); Browser verwenden dieselbe Zeitbasis wie performance.now()
  const space = () => {
    const ev = new KeyboardEvent('keydown', { code: 'Space' });
    Object.defineProperty(ev, 'timeStamp', { value: performance.now() });
    window.dispatchEvent(ev);
  };

  it('zählt Leertaste und ignoriert Anschläge beim Einzählen', async () => {
    const first = await start();
    advanceTo(first + BEAT); // Einzählen
    act(space);
    for (let k = 0; k < 8; k++) {
      advanceTo(first + (4 + k) * BEAT + 20);
      act(space);
    }
    advanceTo(first + 20 * BEAT);
    expect(screen.getByText(/8 von 16 Schlägen/)).toBeTruthy();
  });

  it('meldet zu wenige Anschläge und lässt sich abbrechen', async () => {
    let first = await start();
    advanceTo(first + 20 * BEAT);
    expect(screen.getByText(/Zu wenige Anschläge/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nochmal messen' }));
    });
    first = performance.now() + 400;
    advanceTo(first + BEAT);
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Latenz messen' })).toBeTruthy();
  });
});

describe('MIDI-Assistent', () => {
  it('erscheint beim ersten Start und lässt sich mit dem Simulator überspringen', () => {
    useSettings.getState().update({ onboardingDone: false });
    render(<Onboarding />);
    expect(document.querySelector('dialog.onboarding')!.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('button', { name: "Los geht's" })).toHaveProperty('disabled', true);
    act(() => {
      rt.hub.emit({ type: 'noteon', midi: 62, velocity: 0.5, timeMs: 0, source: 'midi' });
      rt.hub.emit({ type: 'noteoff', midi: 62, timeMs: 1, source: 'midi' });
    });
    expect(screen.getByRole('button', { name: "Los geht's" })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Ohne Piano fortfahren (Simulator)' }));
    expect(useSettings.getState().onboardingDone).toBe(true);
  });
});

const result = (over: Partial<RunResult> = {}): RunResult => ({
  mode: 'wait',
  hands: 'both',
  rate: 1,
  finishedAt: Date.now(),
  durationMs: 65_000,
  accuracy: 0.9,
  correctNotes: 45,
  wrongNotes: 5,
  extraNotes: 0,
  missedNotes: 0,
  totalGroups: 40,
  completedGroups: 40,
  complete: true,
  cleanGroups: 36,
  bestStreak: 20,
  heatmap: [0, 3, 0, 2, 0, 0, 0, 0],
  timing: null,
  ...over,
});

describe('Ergebnis', () => {
  it('zeigt Genauigkeit und schwierige Takte', () => {
    useApp.getState().set({ lastResult: result(), resultsOpen: true });
    render(<ResultsDialog />);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(within(dialog).getAllByText(/90\s*%/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Takt 2/).length).toBeGreaterThan(0);
  });
});

describe('Bibliothek', () => {
  it('listet gespeicherte Stücke und öffnet den Katalog', async () => {
    // Der Katalog kommt per fetch aus /library/catalog.json
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { file: 'bach-prelude.mid', title: 'Präludium C-Dur', composer: 'J. S. Bach', level: 2 },
            ]),
          ),
        ),
      ),
    );
    await rt.importBytes(createDemoMidi(), 'demo.mid', 'demo', 'Demo-Stück');
    useApp.getState().set({ libraryOpen: true });
    render(<LibraryDialog />);
    expect(screen.getAllByText('Demo-Stück').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Stückkatalog' }));
    expect(await screen.findByRole('button', { name: /Präludium C-Dur.*öffnen/ })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe('Aufnahme bearbeiten', () => {
  const take: Recording = {
    bpm: 100,
    numerator: 4,
    denominator: 4,
    startedAt: Date.UTC(2026, 10, 20, 12, 0),
    durationMs: 2400,
    notes: [0, 600, 1200, 1800].map((startMs, i) => ({
      midi: 60 + 2 * i,
      startMs: startMs + 15,
      endMs: startMs + 560,
      velocity: 0.6,
    })),
    pedal: [
      { timeMs: 0, down: true },
      { timeMs: 1200, down: false },
    ],
  };

  it('speichert die quantisierte Aufnahme samt Pedal in der Bibliothek', async () => {
    useApp.getState().set({ take });
    render(<RecordingDialog />);
    const title = screen.getByDisplayValue(/^Aufnahme /);
    fireEvent.change(title, { target: { value: 'Tonleiter' } });
    fireEvent.change(screen.getByLabelText(/Raster/), { target: { value: '8' } });
    expect(useSettings.getState().quantGrid).toBe(8);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'In Bibliothek speichern & üben' }));
    });
    await vi.waitFor(() => expect(useApp.getState().take).toBeNull());
    const song = useApp.getState().song!;
    expect(song.title).toBe('Tonleiter');
    expect(song.notes.map((n) => n.startTick)).toEqual([0, 480, 960, 1440]);
    expect(song.pedals).toEqual([{ startTick: 0, endTick: 960 }]);
    expect((await libraryRepo.get(song.id))?.source).toBe('recording');
  });

  it('verwirft die Aufnahme', () => {
    useApp.getState().set({ take });
    render(<RecordingDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(useApp.getState().take).toBeNull();
  });
});

describe('Offline-Hinweis', () => {
  it('meldet eine neue Version mit Neu-laden-Knopf', () => {
    useApp.getState().set({ offline: 'update' });
    render(<OfflineToast />);
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(useApp.getState().offline).toBe('idle');
  });

  it('blendet „offline verfügbar“ nach einigen Sekunden aus', () => {
    vi.useFakeTimers();
    useApp.getState().set({ offline: 'ready' });
    render(<OfflineToast />);
    expect(screen.getByText(/ohne Internet verfügbar/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(6500));
    expect(useApp.getState().offline).toBe('idle');
    expect(screen.queryByText(/ohne Internet verfügbar/)).toBeNull();
  });
});
