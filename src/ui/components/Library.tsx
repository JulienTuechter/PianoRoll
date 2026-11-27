import { useEffect, useRef, useState } from 'react';
import { catalogDisplayTitle, type CatalogItem } from '../../core/catalog/catalog';
import { sortEntries } from '../../core/library/library';
import type { LibraryEntry } from '../../core/library/types';
import { useCatalog } from '../catalog';
import { getLocale } from '../../i18n';
import libraryConfig from '../../../library.config';
import { pickMidiFile } from '../file-picker';
import { formatTime } from '../format';
import {
  closeSong,
  deleteLibrarySong,
  loadCatalogItem,
  loadDemo,
  openFromLibrary,
  renameLibrarySong,
  errorMessage,
} from '../runtime';
import type { Messages } from '../../i18n';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';

type SortKey = 'recent' | 'title' | 'added';

function formatDate(ts: number | null, t: Messages): string {
  if (ts === null) return '–';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return t.library.today(d.toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' }));
  return d.toLocaleDateString(t.dateLocale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function Row({ entry, current }: { entry: LibraryEntry; current: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = useApp((s) => s.set);

  const open = () =>
    void openFromLibrary(entry.id).catch((err: unknown) => set({ error: errorMessage(err) }));

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
              aria-label={t.library.newTitle}
            />
          </form>
        ) : (
          <button className="link" onClick={open} title={t.library.open}>
            {entry.title}
            {entry.source === 'demo' && <span className="tag">{t.library.demoTag}</span>}
            {entry.source === 'recording' && <span className="tag rec-tag">{t.library.recordingTag}</span>}
            {entry.source === 'catalog' && <span className="tag">{t.library.catalogTag}</span>}
          </button>
        )}
      </td>
      <td className="num">{formatTime(entry.durationSec)}</td>
      <td className="num">{Math.round(entry.bpm)}</td>
      <td>{formatDate(entry.lastPracticedAt, t)}</td>
      <td className="num">
        {entry.runCount > 0 ? (
          <button
            className="link"
            onClick={() => set({ historySongId: entry.id })}
            title={t.library.historyLabel(entry.title)}
          >
            {entry.bestAccuracy === null ? '–' : t.pct(Math.round(entry.bestAccuracy * 100))}
          </button>
        ) : (
          '–'
        )}
      </td>
      <td className="lib-actions">
        {confirmDelete ? (
          <>
            <button className="btn small danger" onClick={() => void deleteLibrarySong(entry.id)}>
              {t.library.delete}
            </button>
            <button className="btn small" onClick={() => setConfirmDelete(false)}>
              {t.common.cancel}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn small icon-sm"
              onClick={() => set({ historySongId: entry.id })}
              aria-label={t.library.historyLabel(entry.title)}
              title={t.library.history}
              disabled={entry.runCount === 0}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19h16" />
                <path d="M5 15l4-5 4 3 6-7" />
              </svg>
            </button>
            <button
              className="btn small icon-sm"
              onClick={() => {
                setTitle(entry.title);
                setEditing(true);
              }}
              aria-label={t.library.renameLabel(entry.title)}
              title={t.library.rename}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h4L19 9l-4-4L4 16z" />
                <path d="M13.5 6.5l4 4" />
              </svg>
            </button>
            <button
              className="btn small icon-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label={t.library.deleteLabel(entry.title)}
              title={t.library.delete}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </svg>
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function CatalogList() {
  const t = useT();
  const library = useApp((s) => s.library);
  const catalog = useCatalog();
  const owned = new Set(library.filter((e) => e.source === 'catalog').map((e) => e.fileName));
  const open = (item: CatalogItem) => void loadCatalogItem(item);
  const levelName = (level: number | null) =>
    level === null
      ? t.library.catalogUncategorized
      : (libraryConfig.levels[level]?.[getLocale()] ?? t.library.catalogLevel(level));

  if (catalog === null) return <p className="muted">{t.library.catalogLoading}</p>;
  if (catalog.length === 0) return <p className="muted">{t.library.catalogEmpty}</p>;
  return (
    <div className="catalog">
      <p className="muted small catalog-intro">{t.library.catalogIntro}</p>
      <div className="catalog-cols">
        {catalog.map((g) => (
          <section key={g.level ?? 'none'} className="catalog-group">
            <h3>{levelName(g.level)}</h3>
            <ul>
              {g.items.map((item) => (
                <li key={item.file}>
                  <button
                    type="button"
                    className="catalog-item"
                    onClick={() => open(item)}
                    aria-label={t.library.catalogOpen(catalogDisplayTitle(item))}
                  >
                    <span className="catalog-title">{item.title}</span>
                    <span className="catalog-meta">
                      <span className="catalog-composer">{item.composer}</span>
                      {owned.has(item.file) && <span className="tag">{t.library.inLibrary}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

type Tab = 'library' | 'catalog';

/** Bibliotheksliste – im Dialog und als Startansicht ohne geladenes Stück. */
export function LibraryList() {
  const t = useT();
  const library = useApp((s) => s.library);
  const currentId = useApp((s) => s.song?.id ?? null);
  const [sort, setSort] = useState<SortKey>('recent');
  // Ohne eigene Stücke direkt den Katalog zeigen
  const [tab, setTab] = useState<Tab>(() => (library.length === 0 ? 'catalog' : 'library'));
  const entries = sortEntries(library, sort);

  return (
    <div className="library">
      <div className="lib-tabs" role="tablist" aria-label={t.library.heading}>
        {(['library', 'catalog'] as const).map((k) => (
          <button
            key={k}
            id={`lib-tab-${k}`}
            type="button"
            role="tab"
            aria-selected={tab === k}
            aria-controls="lib-panel"
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            {k === 'library' ? t.library.tabLibrary : t.library.tabCatalog}
          </button>
        ))}
      </div>
      <div className="library-toolbar">
        <button className="btn primary" onClick={pickMidiFile}>
          {t.library.addFile}
        </button>
        <button className="btn" onClick={() => void loadDemo()}>
          {t.library.demo}
        </button>
        {currentId !== null && (
          <button className="btn" onClick={closeSong} title={t.library.closeCurrent}>
            {t.library.freePlay}
          </button>
        )}
        {tab === 'library' && (
          <label className="sort">
            {t.library.sort}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">{t.library.sortRecent}</option>
              <option value="title">{t.library.sortTitle}</option>
              <option value="added">{t.library.sortAdded}</option>
            </select>
          </label>
        )}
      </div>
      <div id="lib-panel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`}>
        {tab === 'catalog' ? (
          <CatalogList />
        ) : entries.length === 0 ? (
          <p className="muted">{t.library.empty}</p>
        ) : (
          <div className="table-wrap">
            <table className="lib-table">
              <thead>
                <tr>
                  <th>{t.common.title}</th>
                  <th className="num">{t.common.duration}</th>
                  <th className="num">BPM</th>
                  <th>{t.library.colLastPracticed}</th>
                  <th className="num">{t.library.colBest}</th>
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
    </div>
  );
}

export function LibraryDialog() {
  const t = useT();
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
      <h2>{t.library.heading}</h2>
      {open && <LibraryList />}
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ libraryOpen: false })}>
          {t.common.close}
        </button>
      </div>
    </dialog>
  );
}
