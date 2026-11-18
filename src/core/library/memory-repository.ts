import type { LibraryEntry, LibraryRepository, StoredRun } from './types';

/** Flüchtige Implementierung für Tests. */
export class MemoryLibraryRepository implements LibraryRepository {
  private readonly entries = new Map<string, LibraryEntry>();
  private readonly bytes = new Map<string, Uint8Array>();
  private readonly runList: StoredRun[] = [];
  private readonly settings = new Map<string, unknown>();

  list(): Promise<LibraryEntry[]> {
    return Promise.resolve([...this.entries.values()].map((e) => ({ ...e })));
  }
  get(id: string): Promise<LibraryEntry | undefined> {
    const e = this.entries.get(id);
    return Promise.resolve(e ? { ...e } : undefined);
  }
  getBytes(id: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.bytes.get(id));
  }
  put(entry: LibraryEntry, bytes?: Uint8Array): Promise<void> {
    this.entries.set(entry.id, { ...entry });
    if (bytes) this.bytes.set(entry.id, bytes);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.entries.delete(id);
    this.bytes.delete(id);
    for (let i = this.runList.length - 1; i >= 0; i--)
      if (this.runList[i]?.songId === id) this.runList.splice(i, 1);
    return Promise.resolve();
  }
  addRun(run: StoredRun): Promise<void> {
    this.runList.push(run);
    return Promise.resolve();
  }
  runs(songId: string): Promise<StoredRun[]> {
    return Promise.resolve(this.runList.filter((r) => r.songId === songId));
  }
  allRuns(): Promise<StoredRun[]> {
    return Promise.resolve([...this.runList]);
  }
  allSettings(): Promise<Record<string, unknown>> {
    return Promise.resolve(Object.fromEntries(this.settings));
  }
  getSetting<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.settings.get(key) as T | undefined);
  }
  setSetting<T>(key: string, value: T): Promise<void> {
    this.settings.set(key, value);
    return Promise.resolve();
  }
}
