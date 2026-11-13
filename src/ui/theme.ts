/** Farben für Canvas-Renderer (CSS-Variablen gelten nur fürs DOM). Okabe-Ito-basiert, farbenblind-freundlich. */
export const theme = {
  bg: '#0e1014',
  laneBlack: '#12151b',
  laneLine: '#1b1f27',
  measureLine: '#2c323e',
  measureLabel: '#5b6475',
  nowLine: '#d8dde6',
  /** Eigener Tastendruck */
  pressed: '#CC79A7',
  /** Feedback: richtig / falsch / Timing (zusätzlich Symbole, da Farbe allein nicht farbenblind-sicher ist) */
  correct: '#3fb97a',
  wrong: '#ff4d4d',
  timing: '#f0c419',
  waitGlow: '#ffffff',
  loop: '#b48cff',
  sustained: '#7a4a66',
  whiteKey: '#eceef2',
  whiteKeyShade: '#c9ccd3',
  blackKey: '#16181d',
  blackKeyTop: '#2b2f37',
  keyBorder: '#3a3f4a',
  noteText: '#0e1014',
  keyLabel: '#6b7280',
} as const;

export const DEFAULT_RIGHT = '#56B4E9';
export const DEFAULT_LEFT = '#D55E00';

/** Handfarben (einstellbar). `*Key` = hellere Variante für leuchtende Tasten. */
export const handColors = {
  right: DEFAULT_RIGHT,
  rightKey: lighten(DEFAULT_RIGHT, 0.3),
  left: DEFAULT_LEFT,
  leftKey: lighten(DEFAULT_LEFT, 0.3),
};

export function setHandColors(right: string, left: string): void {
  handColors.right = right;
  handColors.rightKey = lighten(right, 0.3);
  handColors.left = left;
  handColors.leftKey = lighten(left, 0.3);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--right', right);
    document.documentElement.style.setProperty('--left', left);
  }
}

/** Mischt eine #rrggbb-Farbe mit Weiß. */
export function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Relative Helligkeit (0..1) – zur Warnung, wenn beide Hände gleich hell sind. */
export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return 0;
  const n = parseInt(m[1], 16);
  const ch = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

/** #rrggbb + Deckkraft → rgba() */
export function rgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}
