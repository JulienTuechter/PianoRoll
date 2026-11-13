import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDemoMidi } from '../demo/demo-song';
import { loadMidiFile } from '../midi-file-loader/load';
import type { RunResult } from '../scoring/scoring';
import { IdbLibraryRepository } from './idb-repository';
import { addSong, overridesToTracks, recordRun, renameSong, sortEntries, updateEntry } from './library';
import { MemoryLibraryRepository } from './memory-repository';
import type { LibraryRepository } from './types';

function result(accuracy: number, correctNotes = 10, complete = true): RunResult {
  return {
    mode: 'wait',
    hands: 'both',
    rate: 1,
    missedNotes: 0,
    timing: null,
    finishedAt: 5000,
    durationMs: 1000,
    accuracy,
    correctNotes,
    wrongNotes: 0,
    extraNotes: 0,
    totalGroups: 10,
    completedGroups: complete ? 10 : 3,
    complete,
    cleanGroups: 10,
    bestStreak: 10,
    heatmap: [],
  };
}

let dbCounter = 0;
const repos: [string, () => LibraryRepository][] = [
  ['Memory', () => new MemoryLibraryRepository()],
  ['IndexedDB', () => new IdbLibraryRepository(`test-${dbCounter++}`)],
];

describe.each(repos)('Bibliothek (%s)', (_name, make) => {
  const bytes = createDemoMidi();
  const song = loadMidiFile(bytes);

  it('legt Stücke an und liefert Bytes zurück', async () => {
    const repo = make();
    const e = await addSong(repo, song, bytes, 'demo.mid', 'demo', 100);
    expect(e).toMatchObject({ id: song.id, title: song.title, runCount: 0, bestAccuracy: null });
    expect(await repo.list()).toHaveLength(1);
    const back = await repo.getBytes(song.id);
    expect(back && loadMidiFile(back).notes.length).toBe(song.notes.length);
  });

  it('behält Fortschritt beim erneuten Hinzufügen derselben Datei', async () => {
    const repo = make();
    await addSong(repo, song, bytes, 'a.mid', 'file', 1);
    await recordRun(repo, song.id, result(0.8));
    const again = await addSong(repo, song, bytes, 'b.mid', 'file', 2);
    expect(again.bestAccuracy).toBe(0.8);
    expect(again.fileName).toBe('a.mid');
  });

  it('aktualisiert beste Genauigkeit, Zähler und zuletzt geübt', async () => {
    const repo = make();
    await addSong(repo, song, bytes, 'a.mid', 'file', 1);
    await recordRun(repo, song.id, result(0.7));
    await recordRun(repo, song.id, result(0.9));
    await recordRun(repo, song.id, result(0.5));
    await recordRun(repo, song.id, result(1, 0)); // nichts gespielt → zählt nicht als Bestwert
    await recordRun(repo, song.id, result(1, 10, false)); // Teil-Durchgang → zählt nicht
    const e = await repo.get(song.id);
    expect(e).toMatchObject({ bestAccuracy: 0.9, runCount: 5, lastPracticedAt: 5000 });
    expect(await repo.runs(song.id)).toHaveLength(5);
  });

  it('benennt um (leere Namen werden ignoriert) und löscht inkl. Durchgängen', async () => {
    const repo = make();
    await addSong(repo, song, bytes, 'a.mid', 'file', 1);
    await renameSong(repo, song.id, '  Mein Stück ');
    await renameSong(repo, song.id, '   ');
    expect((await repo.get(song.id))?.title).toBe('Mein Stück');
    await recordRun(repo, song.id, result(1));
    await repo.delete(song.id);
    expect(await repo.list()).toHaveLength(0);
    expect(await repo.getBytes(song.id)).toBeUndefined();
    expect(await repo.runs(song.id)).toHaveLength(0);
  });

  it('speichert Einstellungen', async () => {
    const repo = make();
    expect(await repo.getSetting('x')).toBeUndefined();
    await repo.setSetting('x', { a: 1 });
    expect(await repo.getSetting('x')).toEqual({ a: 1 });
  });

  it('übernimmt gespeicherte Spur-Korrekturen', async () => {
    const repo = make();
    await addSong(repo, song, bytes, 'a.mid', 'file', 1);
    const e = await updateEntry(repo, song.id, {
      trackOverrides: [
        { handAssignment: 'left', enabled: true },
        { handAssignment: 'split', enabled: false },
      ],
    });
    const tracks = overridesToTracks(song, e!);
    expect(tracks.map((t) => [t.handAssignment, t.enabled])).toEqual([
      ['left', true],
      ['split', false],
    ]);
  });
});

describe('sortEntries', () => {
  const base = {
    fileName: '',
    source: 'file' as const,
    durationSec: 1,
    bpm: 1,
    noteCount: 1,
    trackOverrides: null,
    splitPoint: null,
    bestAccuracy: null,
    runCount: 0,
  };
  const list = [
    { ...base, id: 'a', title: 'Zebra', addedAt: 1, lastPracticedAt: 50 },
    { ...base, id: 'b', title: 'Äpfel', addedAt: 3, lastPracticedAt: null },
    { ...base, id: 'c', title: 'Bach', addedAt: 2, lastPracticedAt: 10 },
  ];
  it('sortiert nach Titel (deutsch), Hinzufügen und zuletzt geübt', () => {
    expect(sortEntries(list, 'title').map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(sortEntries(list, 'added').map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(sortEntries(list, 'recent').map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });
});
