import { useEffect, useState } from 'react';
import { setLang, useCopy, useLang } from './i18n';
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
        <div className="lang" role="group" aria-label="Language">
          {(['en', 'de'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <a className="cta small" href="/app/">
          {c.nav.open}
        </a>
      </div>
    </nav>
  );
}

/** Lichtschiene am rechten Rand: zeigt, wie weit es noch bis zur Klaviatur ist. */
function Rail() {
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
    <div className="rail" aria-hidden="true">
      <span className="rail-beam" />
      {ACTS.map((id, i) => (
        <a key={id} href={`#${id}`} className={i === act ? 'on' : i < act ? 'past' : ''} tabIndex={-1} />
      ))}
    </div>
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
        <p>{c.footer.samples}</p>
      </footer>
    </>
  );
}
