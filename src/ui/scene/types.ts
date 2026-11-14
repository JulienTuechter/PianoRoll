/**
 * Visual Engine („Bühne“): gemeinsame Typen für alle Renderer.
 *
 * Die Bühne ist eine Fläche aus zwei Bereichen übereinander: oben fallende (bzw. im freien Spiel
 * aufsteigende) Noten, unten die Klaviatur. Die Trennlinie ist die Treffer-Linie.
 * Ein Renderer bekommt pro Frame ein fertiges SceneFrame und zeichnet nur; die Logik steckt im Szenenmodell.
 */
import type { FallingFrame, RisingFrame } from '../canvas/falling-notes-renderer';
import type { KeyboardLayout } from '../canvas/keyboard-layout';
import type { KeyboardFrame } from '../canvas/keyboard-renderer';
import type { VisualQuality } from '../store/settings';

export interface SceneSize {
  /** CSS-Pixel */
  width: number;
  /** Höhe des Notenbereichs über der Klaviatur (0 = nur Notenschrift sichtbar) */
  fallHeight: number;
  keyboardHeight: number;
  dpr: number;
}

/** Effekt-Ereignis aus Eingabe und Wertung, wird pro Frame abgearbeitet */
export interface FxEvent {
  /** press = Anschlag ohne Wertung (freies Spiel, Anschauen); hit = Treffer; wrong = falsche Taste */
  kind: 'press' | 'hit' | 'wrong' | 'impact';
  midi: number;
  /** 0..1 */
  velocity: number;
  /** 0..1, z. B. Perfect = 1, Good = 0.7 */
  strength: number;
  /** Farbe der Note (0xRRGGBB) */
  color: number;
}

/** Leuchtende Taste: gedrückt, vom Stück gespielt oder erwartet */
export interface KeyLight {
  midi: number;
  color: number;
  /** 0..1 */
  intensity: number;
  /** Erwartete Taste (pulsiert) */
  expected: boolean;
  /** Falsche Taste (rotes Flackern) */
  wrong: boolean;
}

/** Note, die gerade klingt (für den dünnen Partikelstrom) */
export interface HeldNote {
  midi: number;
  color: number;
}

export interface SceneFrame {
  nowMs: number;
  /** Sekunden seit dem letzten Frame (0 im ersten) */
  dt: number;
  layout: KeyboardLayout;
  /** Mit Stück: fallende Noten; ohne: aufsteigende Spur des freien Spiels */
  falling: { kind: 'song'; frame: FallingFrame } | { kind: 'free'; frame: RisingFrame };
  keyboard: KeyboardFrame;
  /** Farbe einer Note (Hand oder Tonhöhe, je nach Einstellung) */
  colorOf(midi: number, hand: 'left' | 'right'): number;
  lights: readonly KeyLight[];
  held: readonly HeldNote[];
  events: readonly FxEvent[];
  quality: VisualQuality;
  reducedMotion: boolean;
}

export interface NoteRenderer {
  readonly kind: 'webgl' | 'canvas2d';
  /** Legt Zeichenflächen im Host an (der Host liegt absolut über Notenbereich und Klaviatur). */
  mount(host: HTMLElement, size: SceneSize): Promise<void>;
  resize(size: SceneSize): void;
  render(frame: SceneFrame): void;
  destroy(): void;
}
