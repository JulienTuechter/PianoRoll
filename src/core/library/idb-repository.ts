import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LibraryEntry, LibraryRepository, StoredRun } from './types';

interface PianistDB extends DBSchema {
  songs: { key: string; value: LibraryEntry };
  songData: { key: string; value: { id: string; bytes: Uint8Array } };
  runs: { key: number; value: StoredRun; indexes: { bySong: string } };
  kv: { key: string; value: { key: string; value: unknown } };
}

export const DB_NAME = 'pianist';
const DB_VERSION = 1;

/** Persistenz in IndexedDB: Bibliothek, Dateiinhalte, Durchgänge, Einstellungen. */
export class IdbLibraryRepository implements LibraryRepository {
  private dbPromise: Promise<IDBPDatabase<PianistDB>> | null = null;

  constructor(private readonly dbName = DB_NAME) {}

  private db(): Promise<IDBPDatabase<PianistDB>> {
    this.dbPromise ??= openDB<PianistDB>(this.dbName, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('songs', { keyPath: 'id' });
        db.createObjectStore('songData', { keyPath: 'id' });
        const runs = db.createObjectStore('runs', { autoIncrement: true });
        runs.createIndex('bySong', 'songId');
        db.createObjectStore('kv', { keyPath: 'key' });
      },
    });
    return this.dbPromise;
  }

  async list(): Promise<LibraryEntry[]> {
    return (await this.db()).getAll('songs');
  }

  async get(id: string): Promise<LibraryEntry | undefined> {
    return (await this.db()).get('songs', id);
  }

  async getBytes(id: string): Promise<Uint8Array | undefined> {
    return (await (await this.db()).get('songData', id))?.bytes;
  }

  async put(entry: LibraryEntry, bytes?: Uint8Array): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['songs', 'songData'], 'readwrite');
    await tx.objectStore('songs').put(entry);
    if (bytes) await tx.objectStore('songData').put({ id: entry.id, bytes });
    await tx.done;
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['songs', 'songData', 'runs'], 'readwrite');
    await tx.objectStore('songs').delete(id);
    await tx.objectStore('songData').delete(id);
    const keys = await tx.objectStore('runs').index('bySong').getAllKeys(id);
    for (const k of keys) await tx.objectStore('runs').delete(k);
    await tx.done;
  }

  async addRun(run: StoredRun): Promise<void> {
    await (await this.db()).add('runs', run);
  }

  async runs(songId: string): Promise<StoredRun[]> {
    return (await this.db()).getAllFromIndex('runs', 'bySong', songId);
  }

  async allRuns(): Promise<StoredRun[]> {
    return (await this.db()).getAll('runs');
  }

  async allSettings(): Promise<Record<string, unknown>> {
    const rows = await (await this.db()).getAll('kv');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await (await this.db()).get('kv', key))?.value as T | undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await (await this.db()).put('kv', { key, value });
  }
}
