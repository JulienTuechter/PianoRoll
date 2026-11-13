import { useEffect } from 'react';
import { loadFile } from '../runtime';
import { useApp } from '../store/app-store';
import { useT } from '../i18n';

/** Fenster-weites Drag & Drop für MIDI-Dateien. */
export function DropZone() {
  const t = useT();
  const dragging = useApp((s) => s.dragging);
  const set = useApp((s) => s.set);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      set({ dragging: true });
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) set({ dragging: false });
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      set({ dragging: false });
      const file = e.dataTransfer?.files[0];
      if (file) void loadFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [set]);

  if (!dragging) return null;
  return (
    <div className="drop-overlay">
      <div>{t.stage.dropFile}</div>
    </div>
  );
}
