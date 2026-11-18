/**
 * Datensicherung in der Oberfläche: Export als JSON-Datei, Import mit Zusammenführen, dauerhafter Speicher.
 */
import {
  BackupError,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type RestoreSummary,
} from '../core/library/backup';
import { dayKey } from '../core/library/progress';
import { t } from '../i18n';
import { download } from './export';
import { libraryRepo } from './library-repo';
import { refreshLibrary } from './runtime';
import { useSettings } from './store/settings';

export const LAST_BACKUP_KEY = 'lastBackupAt';

export async function exportBackup(): Promise<number> {
  const now = Date.now();
  const backup = await createBackup(libraryRepo, now);
  download(serializeBackup(backup), `pianist-sicherung-${dayKey(now)}.json`, 'application/json');
  await libraryRepo.setSetting(LAST_BACKUP_KEY, now);
  return now;
}

export async function lastBackupAt(): Promise<number | null> {
  return (await libraryRepo.getSetting<number>(LAST_BACKUP_KEY)) ?? null;
}

export function backupErrorMessage(err: unknown): string {
  if (err instanceof BackupError) return t().backup.errors[err.code];
  return err instanceof Error ? err.message : String(err);
}

export async function importBackupFile(file: File, opts: { settings: boolean }): Promise<RestoreSummary> {
  const parsed = parseBackup(await file.text());
  // Zeitpunkt der letzten Sicherung ist gerätebezogen und wird nicht übernommen
  const settings = Object.fromEntries(Object.entries(parsed.settings).filter(([k]) => k !== LAST_BACKUP_KEY));
  const summary = await restoreBackup(libraryRepo, { ...parsed, settings }, opts);
  if (summary.settingsRestored) await useSettings.persist.rehydrate();
  await refreshLibrary();
  return summary;
}

/** Öffnet den Dateidialog für eine Sicherungsdatei. */
export function pickBackupFile(onFile: (f: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) onFile(f);
  };
  input.click();
}

export type StorageState = 'persisted' | 'transient' | 'unsupported';

export async function storageState(): Promise<StorageState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'transient';
  } catch {
    return 'unsupported';
  }
}

/** Bittet den Browser, die Daten nicht bei Speicherknappheit zu löschen (Firefox fragt nach). */
export async function requestPersistentStorage(): Promise<StorageState> {
  try {
    if (navigator.storage?.persist && (await navigator.storage.persist())) return 'persisted';
  } catch {
    /* nicht unterstützt */
  }
  return storageState();
}
