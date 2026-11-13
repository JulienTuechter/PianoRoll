import { useApp } from '../store/app-store';

export function ErrorToast() {
  const error = useApp((s) => s.error);
  const set = useApp((s) => s.set);
  if (!error) return null;
  return (
    <div className="toast" role="alert">
      <span>{error}</span>
      <button className="btn small" onClick={() => set({ error: null })} aria-label="Schließen">
        ✕
      </button>
    </div>
  );
}
