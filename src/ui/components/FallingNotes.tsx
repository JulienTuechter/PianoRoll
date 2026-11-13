import { useCallback } from 'react';
import { drawFallingNotes } from '../canvas/falling-notes-renderer';
import { layoutForWidth } from '../canvas/layout-cache';
import { useCanvasLoop } from '../hooks/useCanvasLoop';
import { getWaitEngine, live, transport } from '../runtime';
import { useSettings } from '../store/settings';

let idCache: { group: unknown; ids: Set<string> } = { group: null, ids: new Set() };

export function FallingNotes() {
  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = useSettings.getState();
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
