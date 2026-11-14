import { useSyncExternalStore } from 'react';

/** Landingpage-Texte. Englisch ist Standard (Crawler lesen eine Sprache pro URL), Deutsch folgt der Browsersprache. */
export type Lang = 'en' | 'de';

const en = {
  nav: { open: 'Open the app', soundOn: 'Sound on', soundOff: 'Sound off', loading: 'Loading sound…' },
  hero: {
    eyebrow: 'Free · open source · in your browser',
    title1: 'The stage',
    title2: 'is yours.',
    lead: 'Pianist turns your MIDI keyboard into a lit stage. Notes fall, time waits until you hit the right key, and every hit throws sparks.',
    cta: 'Open the app',
    try: 'Play right here',
    scroll: 'Scroll down to the keys',
  },
  descent: {
    label: 'From the stage to the keys',
    steps: [
      { k: 'Lights', t: 'Every piece becomes a stage. Load any MIDI file or start with the demo.' },
      { k: 'Lanes', t: 'Notes fall in glowing lanes, one per key. Blue is the right hand, orange the left.' },
      {
        k: 'Landing',
        t: 'They land exactly on the key you play. Beginner beams show where the next note lands.',
      },
      { k: 'Sparks', t: 'Every note you hit throws sparks. The harder you play, the brighter they get.' },
    ],
    hint: 'Scroll to play the demo',
  },
  wait: {
    kicker: 'Wait mode',
    title: 'Time waits for you.',
    lead: 'The music stops on every note until you play it. The left hand plays along for you. Try it: click the glowing key or use your computer keyboard.',
    watch: 'Watch',
    play: 'Play',
    restart: 'Again',
    hits: 'Hits',
    errors: 'Wrong keys',
    done: (acc: number) => `Done. ${acc} % accuracy.`,
    waiting: 'Waiting for you',
    keysHint: 'Letters on the keys = your computer keyboard',
  },
  perf: {
    kicker: 'Performance mode',
    title: 'Or keep time, for real.',
    lead: 'In real time, every hit counts to the millisecond: Perfect within ±50 ms, Good within ±120 ms. Press Space, any key, or tap the lane when the note lands.',
    start: 'Start',
    again: 'Again',
    perfect: 'Perfect',
    good: 'Good',
    miss: 'Miss',
    early: 'early',
    late: 'late',
    spread: 'Your timing spread',
    tap: 'Tap',
  },
  harmony: {
    kicker: 'Harmony Assist',
    title: 'Which chord comes next?',
    lead: 'Play a chord. Pianist names it, finds the key, and suggests what fits next, with Roman numerals and ghost notes on the keys.',
    playing: 'You play',
    none: 'Click three or more keys',
    key: 'Key',
    next: 'Fits next',
    trail: 'Your progression',
    clear: 'Clear',
    latch: 'Keys stay down when clicked. Click again to release.',
    fn: { tonic: 'tonic', subdominant: 'subdominant', dominant: 'dominant' },
  },
  notation: {
    kicker: 'Notation',
    title: 'Falling notes or sheet music. Or both.',
    lead: 'The same piece as real notation, with a cursor that runs along and lights up every sounding note.',
    play: 'Play',
    pause: 'Pause',
    loading: 'Setting the score…',
    bar: (n: number, of: number) => `Bar ${n} of ${of}`,
  },
  quant: {
    kicker: 'Record & quantize',
    title: 'Play it loose. Get it clean.',
    lead: 'Record what you play. The quantizer snaps it to the grid you choose, with triplets, swing and hands kept apart. Then export it.',
    loose: 'As played',
    clean: 'Quantized',
    shuffle: 'Play it again, looser',
    grid: 'Grid',
    listen: 'Listen',
    midi: 'Download MIDI',
    formats: 'Exports MIDI, MusicXML, SVG and PNG',
  },
  rig: {
    kicker: 'Backstage',
    title: 'Everything else you need to practice.',
    items: [
      { t: 'Plug and play', d: 'Web MIDI with hot-plug, velocity and sustain pedal. No driver, no install.' },
      { t: 'No piano? No problem', d: 'Play with your computer keys or the mouse. The app works the same.' },
      { t: 'Practice tools', d: 'Tempo 25–150 %, loop any bars, metronome, count-in and auto-tempo.' },
      {
        t: 'Your library',
        d: 'Pieces and recordings stay in your browser, with progress and best accuracy.',
      },
      {
        t: 'Made for every eye',
        d: 'Color-blind-safe colors, symbols on every judgement, reduced motion respected.',
      },
      {
        t: 'Completely open source',
        d: 'Every line of code is public on GitHub. Read it, fork it, make it better.',
      },
    ],
  },
  finale: {
    title: 'Now it’s your turn.',
    lead: 'All 88 keys. Play them here, or bring your own piano.',
    cta: 'Open the app',
    note: 'Free, no sign-up. Runs in Chrome, Edge, Firefox and Brave.',
  },
  rail: [
    'Stage',
    'From stage to keys',
    'Wait mode',
    'Performance mode',
    'Harmony Assist',
    'Notation',
    'Record & quantize',
    'Backstage',
    'Your turn',
  ],
  github: 'View source on GitHub',
  railLabel: 'Sections',
  footer: {
    samples: 'Piano samples: Salamander Grand Piano V3 by Alexander Holm, CC-BY 3.0',
    local: 'Runs entirely in your browser. Nothing is uploaded.',
  },
};

type Copy = typeof en;

const de: Copy = {
  nav: { open: 'App öffnen', soundOn: 'Ton an', soundOff: 'Ton aus', loading: 'Klang lädt…' },
  hero: {
    eyebrow: 'Kostenlos · Open Source · im Browser',
    title1: 'Die Bühne',
    title2: 'gehört dir.',
    lead: 'Pianist macht dein MIDI-Piano zur beleuchteten Bühne. Noten fallen, die Zeit wartet, bis du die richtige Taste triffst, und jeder Treffer sprüht Funken.',
    cta: 'App öffnen',
    try: 'Hier ausprobieren',
    scroll: 'Runter zu den Tasten',
  },
  descent: {
    label: 'Von der Bühne bis zur Klaviatur',
    steps: [
      {
        k: 'Licht',
        t: 'Jedes Stück wird zur Bühne. Lade eine beliebige MIDI-Datei oder starte mit der Demo.',
      },
      {
        k: 'Bahnen',
        t: 'Noten fallen in leuchtenden Bahnen, eine pro Taste. Blau ist die rechte Hand, Orange die linke.',
      },
      {
        k: 'Landung',
        t: 'Sie landen genau auf der Taste, die du spielst. Führungsstrahlen zeigen, wo die nächste landet.',
      },
      { k: 'Funken', t: 'Jeder Treffer sprüht Funken. Je fester du anschlägst, desto heller.' },
    ],
    hint: 'Scrollen spielt die Demo',
  },
  wait: {
    kicker: 'Warte-Modus',
    title: 'Die Zeit wartet auf dich.',
    lead: 'Die Musik hält bei jeder Note an, bis du sie spielst. Die linke Hand spielt für dich mit. Probier’s: Klick auf die leuchtende Taste oder nimm die Computertastatur.',
    watch: 'Anschauen',
    play: 'Spielen',
    restart: 'Nochmal',
    hits: 'Treffer',
    errors: 'Falsche Tasten',
    done: (acc: number) => `Geschafft. ${acc} % Genauigkeit.`,
    waiting: 'Wartet auf dich',
    keysHint: 'Buchstaben auf den Tasten = deine Computertastatur',
  },
  perf: {
    kicker: 'Performance-Modus',
    title: 'Oder halt den Takt, in Echtzeit.',
    lead: 'In Echtzeit zählt jede Millisekunde: Perfect bis ±50 ms, Good bis ±120 ms. Drück Leertaste, irgendeine Taste oder tippe auf die Bahn, wenn die Note landet.',
    start: 'Start',
    again: 'Nochmal',
    perfect: 'Perfect',
    good: 'Good',
    miss: 'Miss',
    early: 'zu früh',
    late: 'zu spät',
    spread: 'Deine Timing-Streuung',
    tap: 'Tippen',
  },
  harmony: {
    kicker: 'Harmony Assist',
    title: 'Welcher Akkord passt als Nächstes?',
    lead: 'Spiel einen Akkord. Pianist benennt ihn, erkennt die Tonart und schlägt vor, was als Nächstes passt, mit Stufen und Ghost-Notes auf den Tasten.',
    playing: 'Du spielst',
    none: 'Klick drei oder mehr Tasten',
    key: 'Tonart',
    next: 'Passt als Nächstes',
    trail: 'Deine Akkordfolge',
    clear: 'Leeren',
    latch: 'Angeklickte Tasten bleiben gedrückt. Nochmal klicken löst sie.',
    fn: { tonic: 'Tonika', subdominant: 'Subdominante', dominant: 'Dominante' },
  },
  notation: {
    kicker: 'Notenschrift',
    title: 'Fallende Noten oder Notenblatt. Oder beides.',
    lead: 'Dasselbe Stück als echte Notenschrift, mit mitlaufendem Cursor, der jede klingende Note aufleuchten lässt.',
    play: 'Abspielen',
    pause: 'Pause',
    loading: 'Noten werden gesetzt…',
    bar: (n: number, of: number) => `Takt ${n} von ${of}`,
  },
  quant: {
    kicker: 'Aufnehmen & quantisieren',
    title: 'Locker spielen. Sauber notieren.',
    lead: 'Nimm auf, was du spielst. Der Quantizer legt es auf das Raster deiner Wahl, mit Triolen, Swing und getrennten Händen. Danach exportierst du es.',
    loose: 'Wie gespielt',
    clean: 'Quantisiert',
    shuffle: 'Nochmal, lockerer',
    grid: 'Raster',
    listen: 'Anhören',
    midi: 'MIDI herunterladen',
    formats: 'Export als MIDI, MusicXML, SVG und PNG',
  },
  rig: {
    kicker: 'Hinter der Bühne',
    title: 'Alles, was du zum Üben brauchst.',
    items: [
      {
        t: 'Anstecken, losspielen',
        d: 'Web MIDI mit Hot-Plug, Anschlagstärke und Sustain-Pedal. Ohne Treiber, ohne Installation.',
      },
      {
        t: 'Kein Piano? Kein Problem',
        d: 'Spiel mit der Computertastatur oder der Maus. Die App funktioniert genauso.',
      },
      {
        t: 'Übe-Werkzeuge',
        d: 'Tempo 25–150 %, beliebige Takte loopen, Metronom, Einzähler und Auto-Tempo.',
      },
      {
        t: 'Deine Bibliothek',
        d: 'Stücke und Aufnahmen bleiben in deinem Browser, mit Fortschritt und Bestwert.',
      },
      {
        t: 'Für jedes Auge',
        d: 'Farbenblind-sichere Farben, Symbole bei jeder Bewertung, reduzierte Bewegung wird respektiert.',
      },
      {
        t: 'Komplett Open Source',
        d: 'Jede Zeile Code ist öffentlich auf GitHub. Reinschauen, forken, besser machen.',
      },
    ],
  },
  finale: {
    title: 'Jetzt bist du dran.',
    lead: 'Alle 88 Tasten. Spiel sie hier oder schließ dein eigenes Piano an.',
    cta: 'App öffnen',
    note: 'Kostenlos, ohne Anmeldung. Läuft in Chrome, Edge, Firefox und Brave.',
  },
  rail: [
    'Bühne',
    'Von der Bühne zur Klaviatur',
    'Warte-Modus',
    'Performance-Modus',
    'Harmony Assist',
    'Notenschrift',
    'Aufnehmen & quantisieren',
    'Hinter der Bühne',
    'Du bist dran',
  ],
  github: 'Quellcode auf GitHub',
  railLabel: 'Abschnitte',
  footer: {
    samples: 'Piano-Samples: Salamander Grand Piano V3 von Alexander Holm, CC-BY 3.0',
    local: 'Läuft komplett in deinem Browser. Nichts wird hochgeladen.',
  },
};

const STORE_KEY = 'pianist-landing-lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    /* privater Modus */
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let lang: Lang = initial();
const listeners = new Set<() => void>();

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch {
    /* egal */
  }
  for (const fn of listeners) fn();
}

export function getLang(): Lang {
  return lang;
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => lang,
  );
}

export function useCopy(): Copy {
  return useLang() === 'de' ? de : en;
}
