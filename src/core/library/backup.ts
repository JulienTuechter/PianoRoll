/**
 * Datensicherung: Bibliothek (inkl. MIDI-Inhalt), alle Durchgänge und Einstellungen als eine JSON-Datei.
 * Beim Einspielen wird zusammengeführt, nicht überschrieben: Vorhandene Stücke behalten Titel und
 * Spur-Korrekturen, doppelte Durchgänge werden erkannt, Bestleistung und Zähler neu berechnet.
 */
import type { RunResult } from '../scoring/scoring';
import type { LibraryEntry, LibraryRepository, StoredRun } from './types';

export const BACKUP_FORMAT = 'pianist-backup';
export const BACKUP_VERSION = 1;

export interface BackupSong {
  entry: LibraryEntry;
  /** MIDI-Bytes als Base64 */
  data: string | null;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  songs: BackupSong[];
  runs: StoredRun[];
  settings: Record<string, unknown>;
}

export class BackupError extends Error {
  constructor(public readonly code: 'notJson' | 'wrongFormat' | 'newerVersion') {
    super(code);
    this.name = 'BackupError';
  }
}

// Base64 ohne Node-Buffer (läuft im Browser und in Tests)
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createBackup(repo: LibraryRepository, now: number): Promise<Backup> {
  const entries = await repo.list();
  const songs: BackupSong[] = [];
  for (const entry of entries) {
    const bytes = await repo.getBytes(entry.id);
    songs.push({ entry, data: bytes ? bytesToBase64(bytes) : null });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    songs,
    runs: await repo.allRuns(),
    settings: await repo.allSettings(),
  };
}

export function serializeBackup(b: Backup): string {
  return JSON.stringify(b);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Prüft Format und Version; unbrauchbare Einzeleinträge werden übersprungen statt den Import abzubrechen. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || typeof raw.version !== 'number')
    throw new BackupError('wrongFormat');
  if (raw.version > BACKUP_VERSION) throw new BackupError('newerVersion');
  const songs = (Array.isArray(raw.songs) ? raw.songs : []).filter(
    (s): s is BackupSong =>
      isObj(s) &&
      isObj(s.entry) &&
      typeof s.entry.id === 'string' &&
      typeof s.entry.title === 'string' &&
      (typeof s.data === 'string' || s.data === null),
  );
  const runs = (Array.isArray(raw.runs) ? raw.runs : []).filter(
    (r): r is StoredRun =>
      isObj(r) &&
      typeof r.songId === 'string' &&
      isObj(r.result) &&
      typeof r.result.finishedAt === 'number' &&
      typeof r.result.accuracy === 'number',
  );
  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    songs,
    runs,
    settings: isObj(raw.settings) ? raw.settings : {},
  };
}

export interface RestoreSummary {
  songsAdded: number;
  songsMerged: number;
  runsAdded: number;
  settingsRestored: boolean;
}

/** Ein Durchgang gilt als derselbe, wenn Zeitpunkt, Modus und Ergebnis übereinstimmen. */
const runKey = (r: RunResult) => `${r.finishedAt}|${r.mode}|${r.accuracy}|${r.correctNotes}`;

const maxOrNull = (...xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? Math.max(...v) : null;
};

export async function restoreBackup(
  repo: LibraryRepository,
  backup: Backup,
  opts: { settings: boolean },
): Promise<RestoreSummary> {
  const summary: RestoreSummary = { songsAdded: 0, songsMerged: 0, runsAdded: 0, settingsRestored: false };
  const runsBySong = new Map<string, StoredRun[]>();
  for (const r of backup.runs) {
    const list = runsBySong.get(r.songId);
    if (list) list.push(r);
    else runsBySong.set(r.songId, [r]);
  }

  for (const { entry, data } of backup.songs) {
    const existing = await repo.get(entry.id);
    const bytes = data ? base64ToBytes(data) : undefined;
    const localBytes = existing ? await repo.getBytes(entry.id) : undefined;
    if (!existing && !bytes) continue; // ohne Inhalt nicht spielbar

    // Neue Durchgänge (ohne Duplikate) ergänzen
    const known = new Set((await repo.runs(entry.id)).map((r) => runKey(r.result)));
    const fresh = (runsBySong.get(entry.id) ?? []).filter((r) => {
      const k = runKey(r.result);
      if (known.has(k)) return false;
      known.add(k);
      return true;
    });
    for (const r of fresh) await repo.addRun({ songId: entry.id, result: r.result });
    summary.runsAdded += fresh.length;

    const freshBest = maxOrNull(
      ...fresh.filter((r) => r.result.complete && r.result.correctNotes > 0).map((r) => r.result.accuracy),
    );
    const freshLast = maxOrNull(...fresh.map((r) => r.result.finishedAt));
    if (existing) {
      // Lokale Bearbeitungen (Titel, Spuren) gewinnen; Fortschritt wird vereinigt
      await repo.put(
        {
          ...existing,
          addedAt: Math.min(existing.addedAt, entry.addedAt ?? existing.addedAt),
          lastPracticedAt: maxOrNull(existing.lastPracticedAt, entry.lastPracticedAt, freshLast),
          bestAccuracy: maxOrNull(existing.bestAccuracy, freshBest),
          runCount: existing.runCount + fresh.length,
        },
        localBytes ? undefined : bytes,
      );
      summary.songsMerged++;
    } else {
      await repo.put(
        {
          ...entry,
          bestAccuracy: maxOrNull(entry.bestAccuracy, freshBest),
          lastPracticedAt: maxOrNull(entry.lastPracticedAt, freshLast),
          runCount: Math.max(entry.runCount ?? 0, fresh.length),
        },
        bytes,
      );
      summary.songsAdded++;
    }
  }

  if (opts.settings) {
    for (const [key, value] of Object.entries(backup.settings)) await repo.setSetting(key, value);
    summary.settingsRestored = Object.keys(backup.settings).length > 0;
  }
  return summary;
}
