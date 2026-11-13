export interface TrailNote {
  midi: number;
  /** ms (performance.now-Zeitbasis) */
  startMs: number;
  /** null = wird noch gehalten */
  endMs: number | null;
  velocity: number;
}

export interface TrailMark {
  timeMs: number;
  label: string;
}

/**
 * Verlauf des freien Spiels für die aufsteigende Notendarstellung: welche Taste wann gedrückt war,
 * plus Marken (z. B. erkannte Akkorde). Alte Einträge werden automatisch verworfen.
 */
export class NoteTrail {
  private readonly items: TrailNote[] = [];
  private readonly open = new Map<number, TrailNote>();
  private readonly markList: TrailMark[] = [];

  constructor(private readonly keepMs = 15_000) {}

  get notes(): readonly TrailNote[] {
    return this.items;
  }

  get marks(): readonly TrailMark[] {
    return this.markList;
  }

  noteOn(midi: number, timeMs: number, velocity: number): void {
    this.noteOff(midi, timeMs);
    const n: TrailNote = { midi, startMs: timeMs, endMs: null, velocity };
    this.items.push(n);
    this.open.set(midi, n);
  }

  noteOff(midi: number, timeMs: number): void {
    const n = this.open.get(midi);
    if (!n) return;
    n.endMs = Math.max(timeMs, n.startMs + 30);
    this.open.delete(midi);
  }

  mark(label: string, timeMs: number): void {
    const last = this.markList[this.markList.length - 1];
    // gleiche Marke direkt hintereinander nicht wiederholen
    if (last && last.label === label && timeMs - last.timeMs < 1500) return;
    this.markList.push({ timeMs, label });
  }

  /** Verwirft alles, was vor `nowMs - keepMs` endete. */
  prune(nowMs: number): void {
    const limit = nowMs - this.keepMs;
    // Gehaltene Noten bleiben bis zum Loslassen erhalten, egal wie alt
    let w = 0;
    for (const n of this.items) if (n.endMs === null || n.endMs >= limit) this.items[w++] = n;
    this.items.length = w;
    let m = 0;
    while (m < this.markList.length && this.markList[m]!.timeMs < limit) m++;
    if (m > 0) this.markList.splice(0, m);
  }

  clear(): void {
    this.items.length = 0;
    this.open.clear();
    this.markList.length = 0;
  }
}
