# Stückkatalog

Alle MIDI-Dateien in diesem Ordner erscheinen in der App unter **Bibliothek → Stückkatalog**.
Es ist keine Code-Änderung nötig: Datei ablegen, Dev-Server lädt neu bzw. beim nächsten `npm run build` ist sie dabei.

## Ablage

```
catalog/
  01 Einstieg/
    Volkslied - Alle meine Entchen.mid
  02 Leicht/
    Beethoven - Ode an die Freude.mid
```

- **Ordner = Kategorie.** Eine Zahl am Anfang (`01 `, `02_`) legt nur die Reihenfolge fest und wird nicht angezeigt.
  Unterordner werden als „Kategorie / Unterkategorie“ angezeigt.
- **Dateiname = `Komponist - Titel.mid`** (Bindestrich oder Halbgeviertstrich mit Leerzeichen davor und danach).
  Ohne Trenner wird der ganze Name als Titel verwendet. Auch hier sortiert eine führende Zahl.
- Erlaubte Endungen: `.mid`, `.midi`.
- Für die Hand-Erkennung am besten zwei Spuren mit Namen wie „Rechte Hand“/„Linke Hand“ (oder „RH“/„LH“,
  „Right“/„Left“). Sonst wird nach Tonhöhe bzw. Split-Punkt aufgeteilt; korrigieren lässt sich das in der App.

`npm test` lädt jede Datei hier einmal durch den MIDI-Loader und meldet kaputte Dateien.

## Rechte

Nur Stücke ablegen, die gemeinfrei sind **und** deren MIDI-Datei frei verwendet werden darf (eine fremde
Einspielung oder Notensatz-Datei kann eigene Rechte haben, auch wenn die Komposition gemeinfrei ist).

Die mitgelieferten Dateien sind eigene, für die App gesetzte Bearbeitungen gemeinfreier Werke:

| Stück                      | Komponist                         | Hinweis                                                               |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| Alle meine Entchen         | Volkslied                         |                                                                       |
| Ah, vous dirai-je, Maman   | Volkslied (Frankreich, 18. Jh.)   | Melodie von „Morgen kommt der Weihnachtsmann“                         |
| Ode an die Freude          | Ludwig van Beethoven (1770–1827)  | Thema aus der 9. Sinfonie, einfache Begleitung                        |
| Menuett G-Dur BWV Anh. 114 | Christian Petzold (1677–1733)     | aus dem Notenbüchlein für Anna Magdalena Bach, linke Hand vereinfacht |
| Für Elise (Anfang)         | Ludwig van Beethoven              | Teil A, zweimal                                                       |
| Präludium C-Dur BWV 846    | Johann Sebastian Bach (1685–1750) | Takte 1–19 mit Schlussakkord                                          |
