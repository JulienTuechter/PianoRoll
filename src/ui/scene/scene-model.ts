/**
 * Szenenmodell: sammelt pro Frame alles, was die Bühne zeigt, aus Laufzeit, Engines und Einstellungen.
 * Renderer bekommen nur das fertige SceneFrame und enthalten keine Spiellogik.
 */
import { labelForMidi } from '../../core/input/keyboard-map';
import { speller } from '../../core/key-detection/key';
import { firstNoteIndexAtOrAfter } from '../../core/note-event-model/notes';
import type { Hand } from '../../core/note-event-model/types';
import type { FallingFrame, RisingFrame } from '../canvas/falling-notes-renderer';
import type { KeyboardFrame } from '../canvas/keyboard-renderer';
import { layoutForWidth } from '../canvas/layout-cache';
import { freeTrail, harmonyLive } from '../harmony-service';
import { getEngine, getWaitEngine, handFor, hub, live, transport } from '../runtime';
import { useApp } from '../store/app-store';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { handColors } from '../theme';
import { hexToNumber, numberToCss, pitchColor } from './colors';
import { drainFx } from './fx-queue';
import type { FxEvent, HeldNote, KeyLight, SceneFrame, SceneSize } from './types';

/** Anfängermodus: so lange vorher leuchtet die Zieltaste auf (Songsekunden) */
const APPROACH_SEC = 1.2;
/** Erwartete Tasten erst kurz vor ihrer Gruppe zeigen (sonst „leuchten“ sie sekundenlang vorher) */
const EXPECT_LEAD_SEC = 0.6;

const noJudgements = new Map<number, never>();
const noneSatisfied = new Set<number>();

let labelCache: { key: string; map: Map<number, string> } | null = null;
function simulatorLabels(octave: number, layout: 'de' | 'en'): Map<number, string> {
  const key = `${octave}-${layout}`;
  if (labelCache?.key === key) return labelCache.map;
  const map = new Map<number, string>();
  for (let m = 21; m <= 108; m++) {
    const l = labelForMidi(m, octave, layout);
    if (l) map.set(m, l);
  }
  labelCache = { key, map };
  return map;
}

let spellCache: { key: unknown; fn: (pc: number) => string } | null = null;
function spellFor(key: Parameters<typeof speller>[0]): (pc: number) => string {
  if (spellCache?.key !== key) spellCache = { key, fn: speller(key) };
  return spellCache.fn;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class SceneModel {
  private lastMs = 0;
  private prevPos = 0;
  private idCache: { group: unknown; ids: Set<string> } = { group: null, ids: new Set() };
  private readonly active = new Map<number, Hand>();
  private readonly approaching = new Map<number, { hand: Hand; prox: number; label: string }>();
  private readonly lights = new Map<number, KeyLight>();
  private readonly held: HeldNote[] = [];
  private readonly events: FxEvent[] = [];
  private reducedMotion = prefersReducedMotion();
  private readonly mq =
    typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  private readonly onMq = () => (this.reducedMotion = prefersReducedMotion());

  constructor() {
    this.mq?.addEventListener('change', this.onMq);
  }

  dispose(): void {
    this.mq?.removeEventListener('change', this.onMq);
  }

  build(size: SceneSize): SceneFrame {
    const s = useSettings.getState();
    const now = performance.now();
    const dt = this.lastMs === 0 ? 0 : Math.min(0.1, (now - this.lastMs) / 1000);
    this.lastMs = now;
    const layout = layoutForWidth(size.width);
    const song = useApp.getState().song;

    const pitchMode = s.noteColorMode === 'pitch';
    const left = hexToNumber(handColors.left);
    const right = hexToNumber(handColors.right);
    const colorOf = (midi: number, hand: Hand): number =>
      pitchMode ? pitchColor(midi) : hand === 'right' ? right : left;
    const cssColor = (midi: number, hand: Hand): string => numberToCss(colorOf(midi, hand));
    const freeHand = (midi: number): Hand => (midi < s.splitPoint ? 'left' : 'right');

    const pos = transport.position;
    const engine = getEngine();
    const wait = getWaitEngine();
    const group = wait?.currentGroup ?? null;
    if (this.idCache.group !== group)
      this.idCache = { group, ids: new Set(group?.notes.map((n) => n.id) ?? []) };
    const ci = live.countIn;
    const hideBeforeSec = ci && pos < ci.startSec ? ci.startSec : null;
    const notes = live.notes;
    const loop = live.loop;

    // ── Notenbereich ───────────────────────────────────────────────
    let falling: SceneFrame['falling'];
    if (song) {
      const frame: FallingFrame = {
        positionSec: pos,
        windowSec: s.fallWindowSec,
        notes,
        maxDurationSec: live.maxDurationSec,
        measures: live.measures,
        showNoteNames: s.showNoteNames,
        practiced: live.practiced,
        currentIds: group ? this.idCache.ids : null,
        waiting: transport.waiting,
        hideBeforeSec,
        loop,
        beginner: s.beginnerMode,
        color: cssColor,
      };
      falling = { kind: 'song', frame };
    } else {
      const frame: RisingFrame = {
        nowMs: now,
        windowSec: Math.max(4, s.fallWindowSec * 1.5),
        notes: freeTrail.notes,
        marks: freeTrail.marks,
        splitPoint: s.splitPoint,
        showNoteNames: s.showNoteNames,
        spell: spellFor(useHarmony.getState().key),
        color: cssColor,
      };
      falling = { kind: 'free', frame };
    }

    // ── Vom Stück gespielte Tasten (Anschauen, Begleitung) ─────────
    this.active.clear();
    const hideBefore = hideBeforeSec ?? -Infinity;
    for (let i = firstNoteIndexAtOrAfter(notes, pos - live.maxDurationSec); i < notes.length; i++) {
      const n = notes[i]!;
      if (n.startSec > pos) break;
      if (n.startSec + n.durationSec <= pos || n.startSec < hideBefore) continue;
      // Im Wait-Modus zeigt die Klaviatur für die geübte Hand nur die Erwartung, nicht das „Mitklingen“
      if (wait && live.practiced && (live.practiced === 'both' || live.practiced === n.hand)) continue;
      this.active.set(n.midi, n.hand);
    }

    // ── Anfängermodus ──────────────────────────────────────────────
    this.approaching.clear();
    if (s.beginnerMode && notes.length > 0) {
      const spell = spellFor(useHarmony.getState().songKey);
      for (let i = firstNoteIndexAtOrAfter(notes, pos - 1e-6); i < notes.length; i++) {
        const n = notes[i]!;
        if (n.startSec > pos + APPROACH_SEC) break;
        if (n.startSec < pos - 1e-6 || n.startSec < hideBefore) continue;
        if (live.practiced && live.practiced !== 'both' && live.practiced !== n.hand) continue;
        if (loop && (n.startSec >= loop.endSec || n.startSec < loop.startSec)) continue;
        const prox = Math.min(1, 1 - (n.startSec - pos) / APPROACH_SEC);
        const prev = this.approaching.get(n.midi);
        if (!prev || prev.prox < prox)
          this.approaching.set(n.midi, { hand: n.hand, prox, label: spell(n.midi % 12) });
      }
    }

    const expected = group && pos >= group.startSec - EXPECT_LEAD_SEC ? group.expected : null;
    const judgements = engine?.keyJudgements ?? noJudgements;
    const satisfied = wait?.satisfied ?? noneSatisfied;
    const keyboard: KeyboardFrame = {
      pressed: hub.pressed,
      sustained: hub.sustained,
      active: this.active,
      expected,
      satisfied,
      judgements,
      flashes: live.flashes,
      hint: wait?.hint ?? false,
      nowMs: now,
      approaching: this.approaching.size > 0 ? this.approaching : null,
      ghost: harmonyLive.ghost ?? harmonyLive.autoGhost,
      ghostSoft: harmonyLive.ghost === null,
      scalePcs: harmonyLive.scalePcs,
      labels: s.keyboardLabels === 'off' ? null : simulatorLabels(s.simulatorOctave, s.keyboardLabels),
    };

    // ── Tastenlicht: gedrückt > Nachleuchten falsch > erwartet > vom Stück gespielt ──
    this.lights.clear();
    for (const [midi, hand] of this.active) {
      this.lights.set(midi, {
        midi,
        color: colorOf(midi, hand),
        intensity: 0.7,
        expected: false,
        wrong: false,
      });
    }
    if (expected) {
      for (const [midi, hand] of expected) {
        if (satisfied.has(midi)) continue;
        this.lights.set(midi, {
          midi,
          color: colorOf(midi, hand),
          intensity: wait?.hint ? 0.75 : 0.45,
          expected: true,
          wrong: false,
        });
      }
    }
    for (const [midi, flash] of live.flashes) {
      if (flash.kind === 'wrong' && flash.untilMs > now)
        this.lights.set(midi, { midi, color: 0xff3b30, intensity: 1, expected: false, wrong: true });
    }
    this.held.length = 0;
    for (const [midi, p] of hub.pressed) {
      const j = judgements.get(midi);
      if (j === 'wrong') {
        this.lights.set(midi, { midi, color: 0xff3b30, intensity: 1, expected: false, wrong: true });
        continue;
      }
      const hand = expected?.get(midi) ?? (song ? handFor(midi) : freeHand(midi));
      const color = colorOf(midi, hand);
      this.lights.set(midi, {
        midi,
        color,
        intensity: 0.55 + 0.45 * p.velocity,
        expected: false,
        wrong: false,
      });
      this.held.push({ midi, color });
    }
    for (const [midi, hand] of this.active)
      if (!hub.pressed.has(midi)) this.held.push({ midi, color: colorOf(midi, hand) });

    // ── Effekte: Anschläge aus der Warteschlange + Aufprall der vom Stück gespielten Noten ──
    this.events.length = 0;
    for (const e of drainFx()) {
      this.events.push({
        kind: e.kind,
        midi: e.midi,
        velocity: e.velocity,
        strength: e.strength,
        color: e.kind === 'wrong' ? 0xff3b30 : colorOf(e.midi, e.hand),
      });
    }
    if (song && transport.state === 'playing') {
      const jumped = pos < this.prevPos || pos - this.prevPos > 0.3;
      if (!jumped) {
        for (let i = firstNoteIndexAtOrAfter(notes, this.prevPos + 1e-6); i < notes.length; i++) {
          const n = notes[i]!;
          if (n.startSec > pos) break;
          // Noten der geübten Hand zünden über den eigenen Anschlag (Treffer), nicht von selbst
          if (live.practiced && (live.practiced === 'both' || live.practiced === n.hand)) continue;
          if (n.startSec < hideBefore) continue;
          if (loop && (n.startSec < loop.startSec - 1e-6 || n.startSec >= loop.endSec - 1e-6)) continue;
          this.events.push({
            kind: 'impact',
            midi: n.midi,
            velocity: n.velocity,
            strength: 0.6,
            color: colorOf(n.midi, n.hand),
          });
        }
      }
    }
    this.prevPos = pos;

    return {
      nowMs: now,
      dt,
      layout,
      falling,
      keyboard,
      colorOf,
      lights: [...this.lights.values()],
      held: this.held,
      events: this.events,
      quality: s.visualQuality,
      reducedMotion: this.reducedMotion || !s.animations,
    };
  }
}
