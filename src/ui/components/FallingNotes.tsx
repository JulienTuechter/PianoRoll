import { useCallback } from 'react';
import { drawFallingNotes, drawRisingNotes } from '../canvas/falling-notes-renderer';
import { freeTrail } from '../harmony-service';
import { layoutForWidth } from '../canvas/layout-cache';
import { useCanvasLoop } from '../hooks/useCanvasLoop';
import { getWaitEngine, live, transport } from '../runtime';
import { speller } from '../../core/key-detection/key';
import { useApp } from '../store/app-store';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';

let spellCache: { key: unknown; fn: (pc: number) => string } | null = null;
function spellFor(key: Parameters<typeof speller>[0]): (pc: number) => string {
  if (spellCache?.key !== key) spellCache = { key, fn: speller(key) };
  return spellCache.fn;
}

let idCache: { group: unknown; ids: Set<string> } = { group: null, ids: new Set() };

export function FallingNotes() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = useSettings.getState();
    // Ohne Stück: freies Spiel – gespielte Noten steigen nach oben
    if (!useApp.getState().song) {
      drawRisingNotes(ctx, layoutForWidth(w), h, {
        nowMs: performance.now(),
        windowSec: Math.max(4, s.fallWindowSec * 1.5),
        notes: freeTrail.notes,
        marks: freeTrail.marks,
        splitPoint: s.splitPoint,
        showNoteNames: s.showNoteNames,
        spell: spellFor(useHarmony.getState().key),
      });
      return;
    }
    const engine = getWaitEngine();
    const group = engine?.currentGroup ?? null;
    if (idCache.group !== group) idCache = { group, ids: new Set(group?.notes.map((n) => n.id) ?? []) };
    const pos = transport.position;
    const ci = live.countIn;
    drawFallingNotes(ctx, layoutForWidth(w), h, {
      positionSec: pos,
      windowSec: s.fallWindowSec,
      notes: live.notes,
      maxDurationSec: live.maxDurationSec,
      measures: live.measures,
      showNoteNames: s.showNoteNames,
      practiced: live.practiced,
      currentIds: group ? idCache.ids : null,
      waiting: transport.waiting,
      hideBeforeSec: ci && pos < ci.startSec ? ci.startSec : null,
      loop: live.loop,
    });
  }, []);
  const ref = useCanvasLoop(draw);
  return <canvas ref={ref} className="falling-canvas" aria-label="Fallende Noten" />;
}
