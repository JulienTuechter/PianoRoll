/** Datenmodell der Bibliotheksseiten (Build-Zeit, Node). */
import { join } from 'node:path';
import type { Locale } from '../../src/i18n/locale';
import type { MusicalKey } from '../../src/core/key-detection/key';

export type Hands = 'both' | 'right' | 'left';

/**
 * Ein Eintrag in public/library/catalog.json.
 * Pflicht: file, title, composer, license und license_url oder credit. Alles andere ist optional;
 * die berechneten Felder (duration_sec … range) überschreiben, wenn gesetzt, die Werte aus der MIDI-Datei.
 */
export interface CatalogEntry {
  file: string;
  title: string;
  composer: string;
  /** Komponist je Sprache, z. B. „Volkslied“ / „Traditional“ (sonst composer) */
  composer_en?: string;
  composer_de?: string;
  license: string;
  license_url?: string;
  credit?: string;
  license_class?: string;
  // SEO
  title_en?: string;
  title_de?: string;
  aliases?: string[];
  collection?: string;
  /** YYYY-MM-DD */
  added?: string;
  /** false = keine Seiten erzeugen */
  publish?: boolean;
  level?: number;
  hands?: Hands;
  // berechnet (Vorrang, wenn gesetzt)
  duration_sec?: number;
  tempo_bpm?: number;
  time_signature?: string;
  /** „G major“, „E minor“, „Bb major“ (auch „G-Dur“, „e-Moll“) */
  key?: string;
  notes?: number;
  bars?: number;
  /** „C3-G5“ (MIDI-Notennamen, C4 = eingestrichenes c) */
  range?: string;
}

export const ENTRY_FIELDS: readonly (keyof CatalogEntry)[] = [
  'file',
  'title',
  'composer',
  'composer_en',
  'composer_de',
  'license',
  'license_url',
  'credit',
  'license_class',
  'title_en',
  'title_de',
  'aliases',
  'collection',
  'added',
  'publish',
  'level',
  'hands',
  'duration_sec',
  'tempo_bpm',
  'time_signature',
  'key',
  'notes',
  'bars',
  'range',
];

export type KeySource = 'file' | 'catalog' | 'estimated';

/** Aus der MIDI-Datei berechnet, ggf. von catalog.json überschrieben */
export interface PieceStats {
  durationSec: number;
  tempoBpm: number;
  /** Tempo-Spanne, wenn die Datei Tempowechsel hat */
  tempoRange: [number, number] | null;
  timeSignature: string;
  timeSignatureChanges: boolean;
  key: (MusicalKey & { source: KeySource }) | null;
  notes: number;
  notesRight: number;
  notesLeft: number;
  hands: Hands;
  lowest: number;
  highest: number;
  bars: number;
}

/** Note für das Piano-Roll-Bild (Sekunden) */
export interface RollNote {
  start: number;
  dur: number;
  midi: number;
  left: boolean;
}

export interface Piece {
  entry: CatalogEntry;
  slug: string;
  titles: Record<Locale, string>;
  /** Hauptname (Gruppierung, Slug) */
  composer: string;
  composerShort: string;
  /** Anzeige je Sprache: voller Name und Kurzname (Titel) */
  composers: Record<Locale, { name: string; short: string }>;
  composerSlug: string;
  collection: string | null;
  collectionSlug: string | null;
  level: number | null;
  aliases: string[];
  /** YYYY-MM-DD: added, sonst Änderungsdatum der MIDI-Datei */
  added: string;
  lastmod: string;
  stats: PieceStats;
  roll: RollNote[];
  /** Größe der MIDI-Datei in Bytes */
  fileBytes: number;
}

/** Alle Pfade relativ zu einem Projektordner (--root für Tests mit Beispieldaten) */
export interface LibraryPaths {
  root: string;
  catalog: string;
  midiDir: string;
  slugs: string;
  redirects: string;
  vercel: string;
  content: string;
  dist: string;
  indexNowState: string;
}

export function libraryPaths(root: string): LibraryPaths {
  return {
    root,
    catalog: join(root, 'public/library/catalog.json'),
    midiDir: join(root, 'public/library/midi'),
    slugs: join(root, 'library/slugs.json'),
    redirects: join(root, 'library/redirects.json'),
    vercel: join(root, 'vercel.json'),
    content: join(root, 'content'),
    dist: join(root, 'dist'),
    indexNowState: join(root, 'library/indexnow-state.json'),
  };
}

/** Fehler mit Stückname und Grund; der Build bricht ab */
export class LibraryError extends Error {
  override name = 'LibraryError';
  constructor(readonly problems: string[]) {
    super(problems.join('\n'));
  }
}
