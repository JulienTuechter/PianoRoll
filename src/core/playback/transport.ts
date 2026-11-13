import type { Clock } from '../time/clock';

export type TransportState = 'stopped' | 'playing' | 'paused' | 'ended';

type Listener = (state: TransportState) => void;
type SeekListener = (positionSec: number) => void;

/**
 * Zeitachse eines Stücks. Position in Sekunden (Songzeit), Rate = Tempo-Faktor (1 = Originaltempo).
 * Rein über die Clock gesteuert, daher deterministisch testbar.
 */
export class Transport {
  private _state: TransportState = 'stopped';
  private anchorPos = 0;
  private anchorTime = 0;
  private _rate = 1;
  private _holdAt: number | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly seekListeners = new Set<SeekListener>();

  constructor(
    private readonly clock: Clock,
    private _duration = 0,
  ) {}

  get state(): TransportState {
    return this._state;
  }

  get rate(): number {
    return this._rate;
  }

  get duration(): number {
    return this._duration;
  }

  onStateChange(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Wird nach jedem seek() aufgerufen. */
  onSeek(l: SeekListener): () => void {
    this.seekListeners.add(l);
    return () => this.seekListeners.delete(l);
  }

  /** Haltepunkt: Die Zeit läuft höchstens bis hierhin und wartet dann (Wait-Modus). */
  get holdAt(): number | null {
    return this._holdAt;
  }

  /**
   * Setzt/entfernt den Haltepunkt. Die Wartezeit am alten Haltepunkt geht dabei „verloren“,
   * d. h. die Position läuft vom aktuellen Punkt aus weiter statt zu springen.
   */
  setHoldAt(sec: number | null): void {
    const pos = this.position;
    this.anchorPos = pos;
    this.anchorTime = this.clock.now();
    this._holdAt = sec;
  }

  /** Läuft, steht aber am Haltepunkt. */
  get waiting(): boolean {
    return this._state === 'playing' && this._holdAt !== null && this.position >= this._holdAt;
  }

  /** Aktuelle Songposition; erreicht das Ende → Zustand 'ended'. */
  get position(): number {
    if (this._state !== 'playing') return this.anchorPos;
    let pos = this.anchorPos + ((this.clock.now() - this.anchorTime) / 1000) * this._rate;
    if (this._holdAt !== null && pos > this._holdAt) pos = Math.max(this.anchorPos, this._holdAt);
    if (pos >= this._duration) {
      this.anchorPos = this._duration;
      this.setState('ended');
      return this._duration;
    }
    return pos;
  }

  setDuration(sec: number): void {
    this._duration = Math.max(0, sec);
    this.stop();
  }

  play(): void {
    if (this._state === 'playing') return;
    if (this._state === 'ended' || this.anchorPos >= this._duration) this.anchorPos = 0;
    this.anchorTime = this.clock.now();
    this.setState('playing');
  }

  pause(): void {
    if (this._state !== 'playing') return;
    this.anchorPos = this.position;
    if (this._state === 'playing') this.setState('paused');
  }

  toggle(): void {
    if (this._state === 'playing') this.pause();
    else this.play();
  }

  stop(): void {
    this.anchorPos = 0;
    this.setState('stopped');
  }

  /**
   * Springt zu `sec`. Mit `prerollSec` > 0 beginnt die Zeit entsprechend früher (Count-in, ggf. negative Position);
   * Seek-Listener erhalten trotzdem den eigentlichen Zielpunkt.
   */
  seek(sec: number, prerollSec = 0): void {
    const clamped = Math.min(Math.max(0, sec), this._duration);
    this.anchorPos = clamped - Math.max(0, prerollSec);
    this.anchorTime = this.clock.now();
    if (this._state === 'ended') this.setState('paused');
    for (const l of this.seekListeners) l(clamped);
  }

  /** Songposition zu einem (vergangenen) Clock-Zeitpunkt, z. B. dem Zeitstempel eines MIDI-Events. */
  positionAt(timeMs: number): number {
    if (this._state !== 'playing') return this.anchorPos;
    let pos = this.anchorPos + ((timeMs - this.anchorTime) / 1000) * this._rate;
    if (this._holdAt !== null && pos > this._holdAt) pos = Math.max(this.anchorPos, this._holdAt);
    return Math.min(pos, this._duration);
  }

  setRate(rate: number): void {
    const pos = this.position;
    this._rate = Math.min(4, Math.max(0.05, rate));
    this.anchorPos = pos;
    this.anchorTime = this.clock.now();
  }

  private setState(s: TransportState): void {
    if (s === this._state) return;
    this._state = s;
    for (const l of this.listeners) l(s);
  }
}
