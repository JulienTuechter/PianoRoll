# Pianist

MIDI-Piano-Lern-Webapp (React + TypeScript), läuft rein lokal im Browser.

## Start

```bash
nvm use          # Node 24 (Vite 8 braucht Node ≥ 22.12)
npm install
npm run dev      # http://localhost:5173 – Web MIDI braucht localhost oder HTTPS
```

| Befehl                            | Zweck                         |
| --------------------------------- | ----------------------------- |
| `npm run test`                    | Vitest (Kernlogik)            |
| `npm run build`                   | Typecheck + Produktions-Build |
| `npm run lint` / `npm run format` | ESLint / Prettier             |

## Struktur

- `src/core` – reine Logik ohne UI (MIDI-Input, Datei-Loader, Notenmodell, Transport, Audio). Darf kein React importieren (per ESLint erzwungen).
- `src/ui` – React-Komponenten, Zustand-Stores, Canvas-Renderer.

## Simulator

Untere Buchstabenreihe (QWERTZ: `Y X C V B N M`, schwarze Tasten `S D G H J`) = C4–B4,
obere Reihe (`Q W E R T Z U I`, schwarz `2 3 5 6 7`) = C5–C6. `Shift` = Pedal, `-`/`+` = Oktave.
Maus/Touch auf der Klaviatur funktioniert ebenfalls (tiefer klicken = lauter).

## Lizenzen

Piano-Samples: Salamander Grand Piano V3 (Alexander Holm), CC-BY 3.0 – siehe `public/samples/piano/LICENSE.txt`.
