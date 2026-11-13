import { useState, type ReactNode } from 'react';

function load(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`pianist-section-${id}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** Einklappbarer Abschnitt im Seitenpanel; der Zustand wird pro Browser gemerkt. */
export function Section({
  id,
  title,
  children,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => load(id, defaultOpen));
  return (
    <details
      className="panel panel-section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try {
          localStorage.setItem(`pianist-section-${id}`, next ? '1' : '0');
        } catch {
          /* Speicher nicht verfügbar – egal */
        }
      }}
    >
      <summary>
        <h2>{title}</h2>
      </summary>
      {children}
    </details>
  );
}
