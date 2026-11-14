/**
 * Export von Stücken und Aufnahmen: MIDI, MusicXML, SVG und PNG (Notenbild mit eingebetteter Musikschrift).
 */
import { writeMidi } from '../core/export/midi-writer';
import { toMusicXml } from '../core/export/musicxml';
import type { MusicalKey } from '../core/key-detection/key';
import type { NotationScore } from '../core/notation-builder/notation';
import type { NoteEvent } from '../core/note-event-model/types';
import { renderScore } from './notation/render-score';
import { t } from '../i18n';

export function safeFileName(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Stueck';
}

export function download(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface ExportSource {
  title: string;
  ppq: number;
  bpm: number;
  numerator: number;
  denominator: number;
  key: MusicalKey | null;
  notes: readonly NoteEvent[];
  score: NotationScore;
}

/** MIDI-Bytes: rechte Hand Spur 1, linke Hand Spur 2. */
export function midiBytes(src: ExportSource): Uint8Array<ArrayBuffer> {
  const track = (hand: 'right' | 'left', name: string, channel: number) => ({
    name,
    channel,
    notes: src.notes
      .filter((n) => n.hand === hand)
      .map((n) => ({
        midi: n.midi,
        startTick: n.startTick,
        durationTicks: n.durationTicks ?? src.ppq,
        velocity: n.velocity,
      })),
  });
  return writeMidi({
    ppq: src.ppq,
    bpm: src.bpm,
    numerator: src.numerator,
    denominator: src.denominator,
    key: src.key,
    title: src.title,
    tracks: [track('right', t().common.rightHand, 0), track('left', t().common.leftHand, 1)],
  });
}

export function exportMidi(src: ExportSource): void {
  download(midiBytes(src), `${safeFileName(src.title)}.mid`, 'audio/midi');
}

export function exportMusicXml(src: ExportSource): void {
  const xml = toMusicXml(src.score, {
    title: src.title,
    bpm: src.bpm,
    key: src.key,
    partName: t().common.piano,
  });
  download(xml, `${safeFileName(src.title)}.musicxml`, 'application/vnd.recordare.musicxml+xml');
}

let fontCss: Promise<string> | null = null;
/** @font-face-Regeln mit den eingebetteten VexFlow-Schriften, damit SVG/PNG auch ohne die App korrekt aussehen. */
function embeddedFontCss(): Promise<string> {
  fontCss ??= Promise.all([import('@vexflow-fonts/bravura.js'), import('@vexflow-fonts/academico.js')]).then(
    ([b, a]) =>
      `@font-face{font-family:"Bravura";src:url(${b.Bravura}) format("woff2");}` +
      `@font-face{font-family:"Academico";src:url(${a.Academico}) format("woff2");}`,
  );
  return fontCss;
}

/** Setzt das Notenbild unsichtbar mit fester Breite und liefert ein eigenständiges SVG (weißer Hintergrund, Schriften eingebettet). */
export async function standaloneSvg(
  score: NotationScore,
  title: string,
  width = 1100,
): Promise<{ svg: string; width: number; height: number }> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;`;
  document.body.appendChild(host);
  try {
    const layout = await renderScore(host, score, width);
    const svgEl = host.querySelector('svg');
    if (!svgEl) throw new Error(t().errors.scoreFailed);
    const titleH = 50;
    const height = layout.height + titleH;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 ${-titleH} ${width} ${height}`);
    const ns = 'http://www.w3.org/2000/svg';
    const style = document.createElementNS(ns, 'style');
    style.textContent = await embeddedFontCss();
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', String(-titleH));
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    const heading = document.createElementNS(ns, 'text');
    heading.setAttribute('x', String(width / 2));
    heading.setAttribute('y', String(-titleH / 2 + 6));
    heading.setAttribute('text-anchor', 'middle');
    heading.setAttribute('font-family', 'Academico, Georgia, serif');
    heading.setAttribute('font-size', '22');
    heading.textContent = title;
    clone.insertBefore(heading, clone.firstChild);
    clone.insertBefore(bg, clone.firstChild);
    clone.insertBefore(style, clone.firstChild);
    return { svg: new XMLSerializer().serializeToString(clone), width, height };
  } finally {
    host.remove();
  }
}

export async function exportSvg(src: Pick<ExportSource, 'score' | 'title'>): Promise<void> {
  const { svg } = await standaloneSvg(src.score, src.title);
  download(svg, `${safeFileName(src.title)}.svg`, 'image/svg+xml');
}

export async function exportPng(src: Pick<ExportSource, 'score' | 'title'>, scale = 2): Promise<void> {
  const { svg, width, height } = await standaloneSvg(src.score, src.title);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // Schriften im SVG-Bild brauchen evtl. einen Moment
    await new Promise((r) => setTimeout(r, 150));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(t().errors.canvasMissing);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error(t().errors.pngFailed);
    download(blob, `${safeFileName(src.title)}.png`, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
