import { useEffect } from 'react';
import { useT } from '../i18n';
import { applyUpdate } from '../service-worker';
import { useApp } from '../store/app-store';

/** Hinweis „jetzt offline verfügbar“ (verschwindet von selbst) bzw. „neue Version: neu laden“. */
export function OfflineToast() {
  const t = useT();
  const offline = useApp((s) => s.offline);
  const set = useApp((s) => s.set);

  useEffect(() => {
    if (offline !== 'ready') return;
    const id = window.setTimeout(() => set({ offline: 'idle' }), 6000);
    return () => window.clearTimeout(id);
  }, [offline, set]);

  if (offline === 'idle') return null;
  return (
    <div className="toast info" role="status">
      <span>{offline === 'ready' ? t.offline.ready : t.offline.update}</span>
      {offline === 'update' && (
        <button className="btn small primary" onClick={applyUpdate}>
          {t.offline.reload}
        </button>
      )}
      <button className="btn small" onClick={() => set({ offline: 'idle' })} aria-label={t.common.close}>
        ✕
      </button>
    </div>
  );
}
