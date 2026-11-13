import { IdbLibraryRepository } from '../core/library/idb-repository';

/** Gemeinsame IndexedDB-Instanz für Bibliothek, Fortschritt und Einstellungen. */
export const libraryRepo = new IdbLibraryRepository();
