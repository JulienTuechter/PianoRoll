import type { Song } from '../note-event-model/types';
import type { RunResult } from '../scoring/scoring';
import type { LibraryEntry, LibraryRepository, SongSource } from './types';

export function entryFromSong(song: Song, fileName: string, source: SongSource, now: number): LibraryEntry {
  return {
    id: song.id,
    title: song.title,
    fileName,
    source,
    addedAt: now,
    durationSec: song.durationSec,
    bpm: song.tempos[0]?.bpm ?? 120,
    noteCount: song.notes.length,
    trackOverrides: null,
    splitPoint: null,
    lastPracticedAt: null,
    bestAccuracy: null,
    runCount: 0,
  };
}

/** Übernimmt gespeicherte Spur-Korrekturen und Titel aus der Bibliothek in einen frisch geladenen Song (Hände werden danach neu berechnet). */
export function overridesToTracks(song: Song, entry: LibraryEntry): Song['tracks'] {
  return song.tracks.map((t) => {
    const o = entry.trackOverrides?.[t.index];
    return o ? { ...t, handAssignment: o.handAssignment, enabled: o.enabled } : t;
  });
}

/** Legt ein Stück an; existiert es schon (gleicher Inhalt), bleiben Fortschritt und Umbenennung erhalten. */
export async function addSong(
  repo: LibraryRepository,
  song: Song,
  bytes: Uint8Array,
  fileName: string,
  source: SongSource,
  now: number,
): Promise<LibraryEntry> {
  const existing = await repo.get(song.id);
  if (existing) return existing;
  const entry = entryFromSong(song, fileName, source, now);
  await repo.put(entry, bytes);
  return entry;
}

export async function updateEntry(
  repo: LibraryRepository,
  id: string,
  patch: Partial<Omit<LibraryEntry, 'id'>>,
): Promise<LibraryEntry | undefined> {
  const e = await repo.get(id);
  if (!e) return undefined;
  const next = { ...e, ...patch };
  await repo.put(next);
  return next;
}

export async function renameSong(
  repo: LibraryRepository,
  id: string,
  title: string,
): Promise<LibraryEntry | undefined> {
  const t = title.trim();
  if (!t) return repo.get(id);
  return updateEntry(repo, id, { title: t });
}

export async function markPracticed(repo: LibraryRepository, id: string, now: number): Promise<void> {
  await updateEntry(repo, id, { lastPracticedAt: now });
}

/** Speichert einen Durchgang und aktualisiert „zuletzt geübt“ und beste Genauigkeit. */
export async function recordRun(
  repo: LibraryRepository,
  songId: string,
  result: RunResult,
): Promise<LibraryEntry | undefined> {
  const e = await repo.get(songId);
  if (!e) return undefined;
  await repo.addRun({ songId, result });
  // Nur vollständige Durchgänge mit gespielten Noten zählen für die Bestleistung
  const counts = result.complete && result.correctNotes > 0;
  return updateEntry(repo, songId, {
    lastPracticedAt: result.finishedAt,
    runCount: e.runCount + 1,
    bestAccuracy: counts ? Math.max(e.bestAccuracy ?? 0, result.accuracy) : e.bestAccuracy,
  });
}

export function sortEntries(entries: LibraryEntry[], by: 'recent' | 'title' | 'added'): LibraryEntry[] {
  const copy = [...entries];
  switch (by) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'de'));
    case 'added':
      return copy.sort((a, b) => b.addedAt - a.addedAt);
    case 'recent':
      return copy.sort((a, b) => (b.lastPracticedAt ?? b.addedAt) - (a.lastPracticedAt ?? a.addedAt));
  }
}
