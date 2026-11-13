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

## Funktionen

- **Piano anschließen** über Web MIDI (Firefox, Brave), Hot-Plug, Velocity, Sustain-Pedal. Ohne Piano: Simulator (Tastatur/Maus).
- **Modi:** Anschauen, Warten (Zeit hält bis zur richtigen Note/zum Akkord), Performance (Echtzeit mit Perfect/Good/Miss und Timing-Verteilung).
- **Practice:** Tempo 25–150 %, Loop (Taktleiste oder Notenbild ziehen), Metronom, Count-in, Auto-Tempo.
- **Ansichten:** fallende Noten, Notenschrift (VexFlow) mit mitlaufendem Cursor, oder beides. Freies Spiel: aufsteigende Noten.
- **Bühne:** WebGL (PixiJS, nachgeladen) hinter der Schnittstelle `NoteRenderer`, Canvas-2D-Fallback ohne WebGL. Leuchtende Notenkapseln mit Bloom, glühende Treffer-Linie, Funken je nach Anschlagstärke, Tastenlicht in Notenfarbe. Treffer = Funkenschauer, falsche Taste = rotes Flackern. Farbe nach Hand oder Tonhöhe, Qualität Niedrig/Mittel/Hoch, `prefers-reduced-motion` schaltet Funken und Flackern ab. Beim Spielen blenden die Bedienelemente aus.
- **Harmony Assist:** Akkord, Tonart (Krumhansl-Schmuckler), Folgeakkorde mit Stufen, Ghost-Notes; im Stück nächster Akkord und Alternativen.
- **Aufnahme:** mit Count-in und Metronom, Quantisierung (1/4, 1/8, 1/16, Triolen, Swing, Mindestlänge, Überlappungen, Hände-Trennung), Notenvorschau.
- **Export:** MIDI, MusicXML, SVG, PNG – für Aufnahmen und geladene Stücke.
- **Bibliothek** in IndexedDB mit Fortschritt (zuletzt geübt, beste Genauigkeit); Aufnahmen landen ebenfalls dort.
- **Sprachen:** Deutsch und Englisch (Einstellungen → Sprache; „Automatisch“ folgt der Browsersprache). Texte in `src/i18n/locales/`; `de.ts` ist die Quelle, jede weitere Sprache muss denselben Typ erfüllen.

| Taste       | Funktion                         |
| ----------- | -------------------------------- |
| Leertaste   | Play/Pause (bei Aufnahme: Stopp) |
| ← / →       | Takt zurück/vor                  |
| `L`         | Loop an/aus                      |
| `Shift`+`M` | Metronom an/aus                  |
| `Shift`+`B` | Bibliothek                       |

## Struktur

- `src/core` – reine Logik ohne UI, vollständig getestet: MIDI-Input, Datei-Loader, Notenmodell, Transport, Wait-/Performance-Engine, Scoring, Akkord- und Tonarterkennung, Harmonie-Vorschläge, Notation-Builder, Recorder, Quantizer, MIDI-/MusicXML-Export, Audio. Darf kein React importieren (per ESLint erzwungen).
- `src/ui` – React-Komponenten, Zustand-Stores, Canvas-Renderer, VexFlow-Rendering.

**Bekannte Einschränkung:** Die Notenschrift setzt pro Hand eine Stimme (gleichzeitige Töne als Akkord, gehaltene Töne enden beim nächsten Anschlag derselben Hand).

## Simulator

Untere Buchstabenreihe (QWERTZ: `Y X C V B N M`, schwarze Tasten `S D G H J`) = C4–B4,
obere Reihe (`Q W E R T Z U I`, schwarz `2 3 5 6 7`) = C5–C6. `Shift` = Pedal, `-`/`+` = Oktave.
Maus/Touch auf der Klaviatur funktioniert ebenfalls (tiefer klicken = lauter).

## Lizenzen

Piano-Samples: Salamander Grand Piano V3 (Alexander Holm), CC-BY 3.0 – siehe `public/samples/piano/LICENSE.txt`.
