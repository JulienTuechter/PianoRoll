import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDemoMidi } from '../demo/demo-song';
import { loadMidiFile } from '../midi-file-loader/load';
import type { RunResult } from '../scoring/scoring';
import {
  BackupError,
  base64ToBytes,
  bytesToBase64,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from './backup';
import { IdbLibraryRepository } from './idb-repository';
import { addSong, recordRun, renameSong } from './library';
import { MemoryLibraryRepository } from './memory-repository';

function run(accuracy: number, finishedAt: number, complete = true): RunResult {
  return {
    mode: 'wait',
    hands: 'both',
    rate: 1,
    finishedAt,
    durationMs: 60_000,
    accuracy,
    correctNotes: 10,
    wrongNotes: 1,
    extraNotes: 0,
    missedNotes: 0,
    totalGroups: 10,
    completedGroups: complete ? 10 : 2,
    complete,
    cleanGroups: 9,
    bestStreak: 5,
    heatmap: [0, 1],
    timing: null,
  };
}

const bytes = createDemoMidi();
const song = loadMidiFile(bytes);

describe('Datensicherung', () => {
  it('Base64 hin und zurück (auch große Dateien)', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
  });

  it('exportiert und spielt in eine leere Bibliothek ein (IndexedDB)', async () => {
    const src = new IdbLibraryRepository('backup-src');
    await addSong(src, song, bytes, 'demo.mid', 'demo', 100);
    await recordRun(src, song.id, run(0.8, 1000));
    await recordRun(src, song.id, run(0.9, 2000));
    await src.setSetting('pianist-settings', '{"x":1}');

    const text = serializeBackup(await createBackup(src, 5000));
    const dst = new IdbLibraryRepository('backup-dst');
    const sum = await restoreBackup(dst, parseBackup(text), { settings: true });
    expect(sum).toEqual({ songsAdded: 1, songsMerged: 0, runsAdded: 2, settingsRestored: true });
    expect(await dst.get(song.id)).toMatchObject({ bestAccuracy: 0.9, runCount: 2, lastPracticedAt: 2000 });
    const back = await dst.getBytes(song.id);
    expect(back && loadMidiFile(back).notes.length).toBe(song.notes.length);
    expect(await dst.getSetting('pianist-settings')).toBe('{"x":1}');
  });

  it('führt zusammen: keine doppelten Durchgänge, lokaler Titel bleibt, Bestleistung vereinigt', async () => {
    const a = new MemoryLibraryRepository();
    await addSong(a, song, bytes, 'demo.mid', 'demo', 100);
    await recordRun(a, song.id, run(0.7, 1000));
    await recordRun(a, song.id, run(0.95, 3000));
    const backup = await createBackup(a, 4000);

    const b = new MemoryLibraryRepository();
    await addSong(b, song, bytes, 'demo.mid', 'demo', 50);
    await renameSong(b, song.id, 'Mein Titel');
    await recordRun(b, song.id, run(0.7, 1000)); // derselbe Durchgang wie in a
    await b.setSetting('pianist-settings', 'lokal');

    const sum = await restoreBackup(b, backup, { settings: false });
    expect(sum).toMatchObject({ songsAdded: 0, songsMerged: 1, runsAdded: 1 });
    expect(await b.get(song.id)).toMatchObject({
      title: 'Mein Titel',
      addedAt: 50,
      runCount: 2,
      bestAccuracy: 0.95,
      lastPracticedAt: 3000,
    });
    expect(await b.runs(song.id)).toHaveLength(2);
    expect(await b.getSetting('pianist-settings')).toBe('lokal');

    // Zweites Einspielen ändert nichts mehr
    expect((await restoreBackup(b, backup, { settings: false })).runsAdded).toBe(0);
    expect((await b.get(song.id))?.runCount).toBe(2);
  });

  it('erkennt falsche Dateien', () => {
    expect(() => parseBackup('kein json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"x","version":1}')).toThrow(/wrongFormat/);
    expect(() => parseBackup('{"format":"pianist-backup","version":99}')).toThrow(/newerVersion/);
  });

  it('überspringt kaputte Einträge statt abzubrechen', () => {
    const b = parseBackup(
      JSON.stringify({
        format: 'pianist-backup',
        version: 1,
        songs: [{ entry: { id: 'a', title: 'A' }, data: null }, { nope: 1 }],
        runs: [{ songId: 'a' }, { songId: 'a', result: { finishedAt: 1, accuracy: 1 } }],
      }),
    );
    expect(b.songs).toHaveLength(1);
    expect(b.runs).toHaveLength(1);
    expect(b.settings).toEqual({});
  });
});
