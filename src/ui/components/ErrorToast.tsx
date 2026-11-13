import { useApp } from '../store/app-store';
import { useT } from '../i18n';

export function ErrorToast() {
  const t = useT();
  const error = useApp((s) => s.error);
  const set = useApp((s) => s.set);
  if (!error) return null;
  return (
    <div className="toast" role="alert">
      <span>{error}</span>
      <button className="btn small" onClick={() => set({ error: null })} aria-label={t.common.close}>
        ✕
      </button>
    </div>
  );
}
