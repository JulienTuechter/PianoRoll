import { useEffect, useState } from 'react';
import { useCopy, useLang } from './i18n';
import { landingCopy } from '../../src/i18n/landing';
import { appPath, localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import { disableSound, enableSound, useSoundState } from './audio';
import { Hero } from './components/Hero';
import { Descent } from './components/Descent';
import { WaitDemo } from './components/WaitDemo';
import { TimingDemo } from './components/TimingDemo';
import { HarmonyDemo } from './components/HarmonyDemo';
import { NotationDemo } from './components/NotationDemo';
import { QuantizeDemo } from './components/QuantizeDemo';
import { Rig } from './components/Rig';
import { Finale } from './components/Finale';
import { GITHUB_URL } from './links';

const GitHubMark = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/** Sprachwechsel als normale Links ohne JS: jede Sprache hat ihre eigene URL */
function LangLinks({ className }: { className: string }) {
  const c = useCopy();
  const lang = useLang();
  return (
    <div className={className} role="group" aria-label={c.nav.langLabel}>
      {PAGE_LOCALES.filter((l) => l !== lang).map((l) => (
        <a key={l} href={localizedPath('home', l)} hrefLang={l} lang={l}>
          {landingCopy(l).langName}
        </a>
      ))}
    </div>
  );
}

const ACTS = [
  'top',
  'descent',
  'wait',
  'timing',
  'harmony',
  'notation',
  'record',
  'backstage',
  'play',
] as const;

function Nav() {
  const c = useCopy();
  const lang = useLang();
  const sound = useSoundState();
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`nav ${solid ? 'solid' : ''}`}>
      <a className="wordmark" href="#top">
        <img src="/favicon.svg" alt="" width="22" height="22" />
        Pianist
      </a>
      <div className="nav-right">
        <button
          type="button"
          className={`sound ${sound}`}
          onClick={() => (sound === 'on' ? disableSound() : void enableSound())}
          aria-pressed={sound === 'on'}
        >
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {sound === 'loading' ? c.nav.loading : sound === 'on' ? c.nav.soundOn : c.nav.soundOff}
        </button>
        <LangLinks className="lang" />
        <a className="gh" href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label={c.github}>
          <GitHubMark />
        </a>
        <a className="cta small" href={appPath(lang)}>
          {c.nav.open}
        </a>
      </div>
    </nav>
  );
}

/** Lichtschiene am rechten Rand: zeigt, wie weit es noch bis zur Klaviatur ist. */
function Rail() {
  const c = useCopy();
  const [act, setAct] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty('--page-p', (max > 0 ? window.scrollY / max : 0).toFixed(4));
      const mid = window.innerHeight * 0.5;
      let current = 0;
      ACTS.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < mid) current = i;
      });
      setAct(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <nav className="rail" aria-label={c.railLabel}>
      <span className="rail-beam" aria-hidden="true" />
      {ACTS.map((id, i) => (
        <a
          key={id}
          href={`#${id}`}
          className={i === act ? 'on' : i < act ? 'past' : ''}
          style={{ '--i': i } as React.CSSProperties}
          aria-current={i === act ? 'location' : undefined}
        >
          <span className="rail-label">{c.rail[i]}</span>
        </a>
      ))}
    </nav>
  );
}

/** Abschnitte blenden beim Hereinscrollen auf (einmalig) */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(
      '.demo-head, .demo-stage, .notation-stage, .rig-card, .finale-copy, .timing-stage',
    );
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    els.forEach((el) => {
      el.classList.add('reveal');
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}

export function App() {
  const c = useCopy();
  useReveal();
  return (
    <>
      <span id="top" />
      <Nav />
      <Rail />
      <Hero />
      <main>
        <Descent />
        <WaitDemo />
        <TimingDemo />
        <HarmonyDemo />
        <NotationDemo />
        <QuantizeDemo />
        <Rig />
        <Finale />
      </main>
      <footer className="footer">
        <p>{c.footer.local}</p>
        <a className="footer-gh" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GitHubMark />
          {c.github}
        </a>
        <p>{c.footer.samples}</p>
        <LangLinks className="footer-lang" />
      </footer>
    </>
  );
}
