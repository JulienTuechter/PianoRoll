import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { HandFilter } from '../../core/wait-mode-engine/wait-mode-engine';
import { MIDDLE_C } from '../../core/note-event-model/types';
import { detectLocale, type LocalePref } from '../../i18n';
import { libraryRepo } from '../library-repo';

export type PlayMode = 'watch' | 'wait' | 'performance';
/** Mittlerer Bereich: fallende Noten, Notenschrift oder beides übereinander */
export type StageView = 'falling' | 'notation' | 'split';

export interface Settings {
  /** Sprache der Oberfläche; „auto“ = Browsersprache */
  locale: LocalePref;
  midiDeviceId: string | null;
  /** Eigenes Spiel am Piano über die App wiedergeben (Doppelsound mit Piano-Lautsprechern!) */
  echo: boolean;
  echoVolume: number;
  /** Simulator (Computertastatur/Maus) hörbar */
  simulatorSound: boolean;
  /** App-Klang: Vorspielen, Begleitung, Metronom */
  appSound: boolean;
  appVolume: number;
  /** Standard-Split-Punkt für neu geladene Stücke */
  splitPoint: number;
  simulatorOctave: number;
  simulatorVelocity: number;
  keyboardLabels: 'off' | 'de' | 'en';
  showNoteNames: boolean;
  fallWindowSec: number;
  latencyMs: number;
  onboardingDone: boolean;
  // Übung
  mode: PlayMode;
  waitHands: HandFilter;
  /** Nicht geübte Hand spielt automatisch mit */
  accompaniment: boolean;
  chordToleranceMs: number;
  /** 0 = aus */
  hintAfterErrors: number;
  lastSongId: string | null;
  // Practice
  metronome: boolean;
  metronomeVolume: number;
  /** 0 = kein Count-in */
  countInBars: number;
  autoTempo: boolean;
  autoTempoPasses: number;
  autoTempoStepPercent: number;
  autoTempoMaxPercent: number;
  // Performance-Wertung
  perfectMs: number;
  goodMs: number;
  // Farben
  rightColor: string;
  leftColor: string;
  // Harmony Assist
  /** A: Freispiel – Akkord, Tonart, Folgeakkorde */
  harmonyFree: boolean;
  /** B: Akkorde im Stück (nächster Akkord, Alternativen) */
  harmonySong: boolean;
  /** Skalentöne der Tonart auf der Klaviatur markieren */
  harmonyScaleTones: boolean;
  /** Manuell gewählte Tonart (null = automatisch) */
  harmonyKey: { tonicPc: number; mode: 'major' | 'minor' } | null;
  /** Vorschlag beim Anklicken anspielen */
  harmonyAudition: boolean;
  /** Wahrscheinlichsten Folgeakkord im Freispiel automatisch auf der Klaviatur zeigen */
  harmonyAutoGhost: boolean;
  view: StageView;
  // Notenschrift: Zeichen über und unter dem System
  notationChords: boolean;
  notationPedal: boolean;
  notationDynamics: boolean;
  // Aufnahme
  recBpm: number;
  recNumerator: number;
  recDenominator: number;
  recMetronome: boolean;
  // Quantisierung
  quantGrid: 4 | 8 | 16;
  quantTriplets: boolean;
  quantSwing: number;
  quantMinNote: number;
  quantResolveOverlaps: boolean;
  // Visuell
  /** Anfängermodus: Führungsstrahl zur Taste, Zieltaste leuchtet vorher auf (mit Notennamen) */
  beginnerMode: boolean;
  /** Bühne: Qualitätsstufe (Partikelzahl, Bloom) */
  visualQuality: VisualQuality;
  /** Bühnen-Animationen: Funken, Flackern, Pulsieren (aus = ruhiges Leuchten) */
  animations: boolean;
  /** Notenfarbe nach Hand oder nach Tonhöhe (links kühl, rechts warm) */
  noteColorMode: NoteColorMode;
  /** Seitenleiste über der Bühne sichtbar */
  sidePanelOpen: boolean;
}

export type VisualQuality = 'low' | 'medium' | 'high';
export type NoteColorMode = 'hand' | 'pitch';

interface SettingsStore extends Settings {
  update(partial: Partial<Settings>): void;
}

export const defaultSettings: Settings = {
  locale: 'auto',
  midiDeviceId: null,
  echo: false,
  echoVolume: 0.8,
  simulatorSound: true,
  appSound: true,
  appVolume: 0.7,
  splitPoint: MIDDLE_C,
  simulatorOctave: 4,
  simulatorVelocity: 0.7,
  // Tastenbeschriftung des Simulators passend zur Browsersprache (QWERTZ bzw. QWERTY)
  keyboardLabels: detectLocale() === 'de' ? 'de' : 'en',
  showNoteNames: true,
  fallWindowSec: 3,
  latencyMs: 0,
  onboardingDone: false,
  mode: 'wait',
  waitHands: 'both',
  accompaniment: true,
  chordToleranceMs: 150,
  hintAfterErrors: 3,
  lastSongId: null,
  metronome: false,
  metronomeVolume: 0.6,
  countInBars: 1,
  autoTempo: false,
  autoTempoPasses: 3,
  autoTempoStepPercent: 5,
  autoTempoMaxPercent: 100,
  perfectMs: 50,
  goodMs: 120,
  rightColor: '#56B4E9',
  leftColor: '#D55E00',
  harmonyFree: true,
  harmonySong: true,
  harmonyScaleTones: false,
  harmonyKey: null,
  harmonyAudition: true,
  harmonyAutoGhost: true,
  view: 'split',
  notationChords: true,
  notationPedal: true,
  notationDynamics: true,
  recBpm: 90,
  recNumerator: 4,
  recDenominator: 4,
  recMetronome: true,
  quantGrid: 16,
  quantTriplets: false,
  quantSwing: 0.5,
  quantMinNote: 16,
  quantResolveOverlaps: true,
  beginnerMode: false,
  visualQuality: 'medium',
  animations: false,
  noteColorMode: 'hand',
  // Auf schmalen Bildschirmen verdeckt die Leiste sonst die halbe Bühne
  sidePanelOpen: typeof window === 'undefined' || window.innerWidth > 900,
};

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Einstellungen in IndexedDB; beim ersten Start werden alte Werte aus localStorage (Phase 1) übernommen. */
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const v = await libraryRepo.getSetting<string>(name);
      if (typeof v === 'string') return v;
    } catch (err) {
      console.warn('Einstellungen konnten nicht aus IndexedDB gelesen werden', err);
    }
    return safeLocalStorage()?.getItem(name) ?? null;
  },
  setItem: async (name, value) => {
    try {
      await libraryRepo.setSetting(name, value);
      safeLocalStorage()?.removeItem(name);
    } catch (err) {
      console.warn('Einstellungen konnten nicht gespeichert werden', err);
    }
  },
  removeItem: async (name) => {
    await libraryRepo.setSetting(name, null);
  },
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      update: (partial) => set(partial),
    }),
    {
      name: 'pianist-settings',
      version: 10,
      storage: createJSONStorage(() => idbStorage),
      // Neue Felder bekommen Standardwerte; unbekannte alte Felder werden ignoriert
      migrate: (persisted) => {
        // v10: Schalter „strict“ entfernt, falsche Noten zählen immer als Fehler
        const merged = { ...defaultSettings, ...(persisted as Partial<Settings>) };
        delete (merged as { strict?: boolean }).strict;
        return merged;
      },
      partialize: ({ update: _update, ...rest }) => rest,
    },
  ),
);

/** Wartet, bis die Einstellungen aus IndexedDB geladen sind. */
export function settingsHydrated(): Promise<void> {
  if (useSettings.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const off = useSettings.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}
