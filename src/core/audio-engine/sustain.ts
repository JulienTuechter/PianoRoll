/**
 * Pedallogik: Note-Offs während gedrücktem Pedal werden zurückgehalten und beim Loslassen ausgegeben.
 * Ein erneuter Anschlag derselben Taste beendet die gehaltene Note zuerst (Retrigger).
 */
export class SustainTracker {
  private down = false;
  private readonly held = new Set<number>();
  private readonly active = new Set<number>();

  /** Liefert true, wenn vorher eine gehaltene Note desselben Tons beendet werden muss. */
  noteOn(midi: number): { retrigger: boolean } {
    const retrigger = this.held.delete(midi) || this.active.has(midi);
    this.active.add(midi);
    return { retrigger };
  }

  /** Liefert true, wenn die Note jetzt wirklich enden soll. */
  noteOff(midi: number): boolean {
    if (!this.active.delete(midi)) return false;
    if (this.down) {
      this.held.add(midi);
      return false;
    }
    return true;
  }

  /** Liefert die Noten, die beim Loslassen des Pedals enden müssen. */
  setPedal(down: boolean): number[] {
    this.down = down;
    if (down) return [];
    const released = [...this.held];
    this.held.clear();
    return released;
  }

  reset(): void {
    this.held.clear();
    this.active.clear();
  }
}
