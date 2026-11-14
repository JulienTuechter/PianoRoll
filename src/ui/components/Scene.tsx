import { useEffect, useRef } from 'react';
import { Canvas2DRenderer } from '../scene/canvas2d-renderer';
import { useSettings } from '../store/settings';
import { SceneModel } from '../scene/scene-model';
import type { NoteRenderer, SceneSize } from '../scene/types';

/**
 * Bühne: eine Zeichenfläche über Notenbereich und Klaviatur, damit Licht, Bloom und Funken über die
 * Treffer-Linie hinweg wirken. Animationen aus: schlichte fallende Noten in Canvas 2D (kein WebGL,
 * kein Bloom, keine Funken). Animationen an: wechselt auf WebGL (PixiJS), sobald es geladen ist und
 * der Browser es kann. Der Schalter wirkt sofort.
 */
export function Scene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const col = host?.parentElement;
    if (!host || !col) return;
    const model = new SceneModel();
    let disposed = false;
    let size: SceneSize = { width: 0, fallHeight: 0, keyboardHeight: 0, dpr: 1 };

    /** Bühne folgt dem Notenbereich (falls sichtbar) und der Klaviatur */
    const measure = (): SceneSize => {
      const colRect = col.getBoundingClientRect();
      const kb = col.querySelector<HTMLElement>('.keyboard-wrap')?.getBoundingClientRect();
      const fall = col.querySelector<HTMLElement>('.falling-pane')?.getBoundingClientRect();
      const keyboardHeight = kb ? Math.round(kb.height) : 0;
      const fallHeight = fall ? Math.round(fall.height) : 0;
      const top = fall ? fall.top - colRect.top : kb ? kb.top - colRect.top : 0;
      host.style.top = `${Math.round(top)}px`;
      host.style.height = `${fallHeight + keyboardHeight}px`;
      return {
        width: Math.round(colRect.width),
        fallHeight,
        keyboardHeight,
        dpr: window.devicePixelRatio || 1,
      };
    };
    const changed = (a: SceneSize, b: SceneSize) =>
      a.width !== b.width ||
      a.fallHeight !== b.fallHeight ||
      a.keyboardHeight !== b.keyboardHeight ||
      a.dpr !== b.dpr;

    size = measure();
    let renderer: NoteRenderer = new Canvas2DRenderer();
    void renderer.mount(host, size);
    /** Zählt Wechsel hoch, damit ein verspätet geladenes PixiJS nicht einen neueren Wunsch überschreibt */
    let generation = 0;

    const swapTo = (next: NoteRenderer) => {
      renderer.destroy();
      renderer = next;
      void renderer.mount(host, size);
    };

    const toPixi = () => {
      const gen = ++generation;
      void import('../scene/pixi-renderer')
        .then(async ({ PixiRenderer }) => {
          if (disposed || gen !== generation || !PixiRenderer.supported()) return;
          const next = new PixiRenderer();
          try {
            await next.mount(host, size);
          } catch (err) {
            console.warn('WebGL-Bühne nicht verfügbar, bleibe bei Canvas 2D', err);
            next.destroy();
            return;
          }
          if (disposed || gen !== generation) {
            next.destroy();
            return;
          }
          renderer.destroy();
          renderer = next;
          renderer.resize(size);
        })
        .catch((err: unknown) => console.warn('PixiJS konnte nicht geladen werden', err));
    };

    const toPlain = () => {
      generation++;
      if (renderer.kind !== 'canvas2d') swapTo(new Canvas2DRenderer());
    };

    let animated = useSettings.getState().animations;
    if (animated) toPixi();
    const unsubscribe = useSettings.subscribe((st) => {
      if (st.animations === animated) return;
      animated = st.animations;
      if (animated) toPixi();
      else toPlain();
    });

    let raf = 0;
    const frame = () => {
      const next = measure();
      if (changed(next, size)) {
        size = next;
        renderer.resize(size);
      }
      if (size.width > 0 && size.fallHeight + size.keyboardHeight > 0) renderer.render(model.build(size));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      unsubscribe();
      cancelAnimationFrame(raf);
      renderer.destroy();
      model.dispose();
    };
  }, []);

  return <div ref={hostRef} className="scene" />;
}
