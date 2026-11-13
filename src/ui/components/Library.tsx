import { useEffect, useRef, useState } from 'react';
import { sortEntries } from '../../core/library/library';
import type { LibraryEntry } from '../../core/library/types';
import { pickMidiFile } from '../file-picker';
import { formatTime } from '../format';
import { deleteLibrarySong, loadDemo, openFromLibrary, renameLibrarySong } from '../runtime';
import { useApp } from '../store/app-store';

type SortKey = 'recent' | 'title' | 'added';

function formatDate(ts: number | null): string {
  if (ts === null) return '–';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Row({ entry, current }: { entry: LibraryEntry; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = useApp((s) => s.set);

  const open = () =>
    void openFromLibrary(entry.id).catch((err: unknown) =>
      set({ error: err instanceof Error ? err.message : String(err) }),
    );

  return (
    <tr className={current ? 'current' : ''}>
      <td className="lib-title">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              void renameLibrarySong(entry.id, title);
            }}
          >
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditing(false);
                void renameLibrarySong(entry.id, title);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setTitle(entry.title);
                  setEditing(false);
                }
              }}
              aria-label="Neuer Titel"
            />
          </form>
        ) : (
          <button className="link" onClick={open} title="Öffnen">
            {entry.title}
            {entry.source === 'demo' && <span className="tag">Demo</span>}
            {entry.source === 'recording' && <span className="tag rec-tag">Aufnahme</span>}
          </button>
        )}
      </td>
      <td className="num">{formatTime(entry.durationSec)}</td>
      <td className="num">{Math.round(entry.bpm)}</td>
      <td>{formatDate(entry.lastPracticedAt)}</td>
      <td className="num">
        {entry.bestAccuracy === null ? '–' : `${Math.round(entry.bestAccuracy * 100)} %`}
      </td>
      <td className="lib-actions">
        {confirmDelete ? (
          <>
            <button className="btn small danger" onClick={() => void deleteLibrarySong(entry.id)}>
              Löschen
            </button>
            <button className="btn small" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            <button
              className="btn small"
              onClick={() => {
                setTitle(entry.title);
                setEditing(true);
              }}
              aria-label={`${entry.title} umbenennen`}
              title="Umbenennen"
            >
              ✎
            </button>
            <button
              className="btn small"
              onClick={() => setConfirmDelete(true)}
              aria-label={`${entry.title} löschen`}
              title="Löschen"
            >
              🗑
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/** Bibliotheksliste – im Dialog und als Startansicht ohne geladenes Stück. */
export function LibraryList() {
  const library = useApp((s) => s.library);
  const currentId = useApp((s) => s.song?.id ?? null);
  const [sort, setSort] = useState<SortKey>('recent');
  const entries = sortEntries(library, sort);

  return (
    <div className="library">
      <div className="library-toolbar">
        <button className="btn primary" onClick={pickMidiFile}>
          MIDI-Datei hinzufügen …
        </button>
        <button className="btn" onClick={() => void loadDemo()}>
          Demo-Stück
        </button>
        <label className="sort">
          Sortieren
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Zuletzt geübt</option>
            <option value="title">Titel</option>
            <option value="added">Hinzugefügt</option>
          </select>
        </label>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Noch keine Stücke. Zieh eine MIDI-Datei hierher oder lade das Demo-Stück.</p>
      ) : (
        <div className="table-wrap">
          <table className="lib-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th className="num">Dauer</th>
                <th className="num">BPM</th>
                <th>Zuletzt geübt</th>
                <th className="num">Beste</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Row key={e.id} entry={e} current={e.id === currentId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LibraryDialog() {
  const open = useApp((s) => s.libraryOpen);
  const set = useApp((s) => s.set);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog wide" onClose={() => set({ libraryOpen: false })}>
      <h2>Bibliothek</h2>
      {open && <LibraryList />}
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ libraryOpen: false })}>
          Schließen
        </button>
      </div>
    </dialog>
  );
}
