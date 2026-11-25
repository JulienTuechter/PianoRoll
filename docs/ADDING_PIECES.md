# Stück zur Bibliothek hinzufügen

1. MIDI-Datei nach `public/library/midi/` legen (ASCII-Dateiname, z. B. `mozart-die-zauberfloete.mid`).
2. `npm run library:stubs` legt den Eintrag in `public/library/catalog.json` an (Dauer, Tempo, Taktart … berechnet).
3. `title`, `composer`, `license` ausfüllen, dazu `license_url` **oder** `credit` (das andere Feld löschen).
4. Optional: `title_en`/`title_de`, `aliases`, `collection`, `level`, `license_class` (muss in `library.config.ts` erlaubt sein).
5. Optional: eigener Text in `content/pieces/<slug>.de.md` bzw. `.en.md` (Slug steht nach dem Build in `library/slugs.json`).
6. `npm run library:check` baut alles und prüft: kein TODO, Lizenz, Titel/Descriptions, Links, Sitemap, Feed.
7. Commit + Push: MIDI, `catalog.json`, `library/slugs.json` (und ggf. `content/…`). Vercel baut die Seiten.
8. URL bewusst ändern: `npm run library:rename -- <alt> <neu>` (301 in `vercel.json`, alle drei Dateien committen).
9. Nicht veröffentlichen: `"publish": false` im Eintrag. Nach dem Deploy optional: `npm run seo:ping` (IndexNow).
