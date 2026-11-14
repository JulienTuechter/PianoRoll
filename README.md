# Pianist

**English** · [Deutsch](README.de.md)

A web app for learning piano with a MIDI keyboard. Load a song, watch the notes fall, and play along: Pianist waits for you, scores your timing, or just plays the piece for you. Everything runs locally in the browser. No account, no server, no tracking.

Built with React and TypeScript.

## Features

- **Connect your piano** via Web MIDI (Firefox, Brave): hot-plugging, velocity and sustain pedal. No piano? Use the built-in simulator with your computer keyboard or mouse.
- **Three play modes**
  - **Watch:** the piece plays by itself.
  - **Wait:** time stops until you hit the right note or chord.
  - **Performance:** real time, rated Perfect / Good / Miss, with a timing distribution afterwards.
- **Practice tools:** tempo from 25 to 150 %, loops (drag over the bar strip or the score), metronome, count-in and auto-tempo.
- **Views:** falling notes, sheet music (VexFlow) with a moving cursor, or both. Free play shows rising notes.
- **Stage:** WebGL rendering (PixiJS, loaded on demand) with a Canvas 2D fallback. Glowing notes with bloom, sparks that scale with velocity, and keys lit in the note's color. Hits throw sparks and wrong keys flash red. Colors go by hand or by pitch, with three quality levels. `prefers-reduced-motion` turns off sparks and flashing. The controls fade out while you play.
- **Harmony Assist:** detects the current chord and key (Krumhansl–Schmuckler) and suggests next chords with scale degrees and ghost notes. Inside a song it shows the upcoming chord and alternatives.
- **Recording** with count-in and metronome. Quantization supports 1/4, 1/8, 1/16, triplets and swing, plus minimum length, overlap handling and hand splitting. The score preview updates as you go.
- **Export** to MIDI, MusicXML, SVG or PNG, for recordings and for loaded songs.
- **Library** stored in IndexedDB that tracks your progress (last practiced, best accuracy). Recordings are saved there too.
- **Languages:** English and German. "Automatic" follows the browser language.

### Keyboard shortcuts

| Key           | Action                               |
| ------------- | ------------------------------------ |
| `Space`       | Play / pause (while recording: stop) |
| `←` / `→`     | Previous / next bar                  |
| `L`           | Toggle loop                          |
| `Shift` + `M` | Toggle metronome                     |
| `Shift` + `B` | Open the library                     |

### Simulator

| Keys                                      | Notes            |
| ----------------------------------------- | ---------------- |
| `Y X C V B N M`, black keys `S D G H J`   | C4 – B4          |
| `Q W E R T Z U I`, black keys `2 3 5 6 7` | C5 – C6          |
| `Shift`                                   | Sustain          |
| `-` / `+`                                 | Octave down / up |

The layout assumes a German QWERTZ keyboard. You can also click or tap the on-screen keys. Clicking lower on a key plays it louder.

## Getting started

Requires **Node.js ≥ 22.12** (Vite 8). The repo pins Node 24 in `.nvmrc`.

```bash
nvm use
npm install
npm run dev      # http://localhost:5173
```

Web MIDI only works on `localhost` or over HTTPS.

| Command                           | Purpose                       |
| --------------------------------- | ----------------------------- |
| `npm run dev`                     | Dev server                    |
| `npm run test`                    | Unit tests (Vitest)           |
| `npm run build`                   | Type check + production build |
| `npm run preview`                 | Serve the production build    |
| `npm run lint` / `npm run format` | ESLint / Prettier             |

## Deployment

The landing page is served at `/` and the app at `/app/`.

Link previews (WhatsApp, Slack, Facebook, …) need the public URL at build time:

```bash
SITE_URL=https://your-domain.com npm run build
```

You can also put `SITE_URL=…` in a `.env` file. The build uses it to generate `og:url`, `og:image`, `canonical`, `robots.txt` and `sitemap.xml`. The preview image is `public/og-image.png` (1200 × 630).

## Project structure

```
landing/          Landing page (React, reuses the core logic and renderers for live demos)
app/index.html    Entry point of the app
src/core/         Pure logic, no UI, fully tested
src/ui/           React components, Zustand stores, Canvas/WebGL and VexFlow rendering
src/i18n/locales/ Translations
public/           Icons, preview image, piano samples
```

`src/core` covers MIDI input, file loading, the note model, transport, the wait and performance engines, scoring, chord and key detection, harmony suggestions, the notation builder, recorder, quantizer, MIDI/MusicXML export and audio. It must not import React, and ESLint enforces this.

### Adding a language

`src/i18n/locales/de.ts` is the source of truth. A new locale file has to satisfy the same type, so TypeScript reports any missing strings.

## Known limitations

Sheet music uses one voice per hand. Simultaneous notes become a chord, and a held note ends at the next onset in the same hand.

## License

Pianist is released under the [GNU Affero General Public License v3.0](Licence.md).

Piano samples: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, CC BY 3.0. See `public/samples/piano/LICENSE.txt`.
