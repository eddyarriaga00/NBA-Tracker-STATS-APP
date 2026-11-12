import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Routes, useLocation, useNavigationType } from 'react-router-dom';
import { setMorph } from './morph';

// Where each visited page was scrolled to, by history entry, so Back returns you there.
const scrolled = new Map();
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual';

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isGame = (pathname) => /^\/[a-z]+\/game\//.test(pathname);

/**
 * <Routes>, with two things added when the page changes:
 *
 * - The switch cross-fades (and a tapped score card grows into the game page)
 *   using the browser's View Transitions, where it has them. Without them, or
 *   with reduced motion on, pages cut as before.
 * - A new page starts at the top; going back or forward returns to where you were.
 *
 * The router's location changes first; the page on screen only changes inside
 * the transition, once the next page's code is loaded (`preload(pathname)`).
 */
export default function TransitionRoutes({ children, preload }) {
  const location = useLocation();
  const type = useNavigationType();
  const [shown, setShown] = useState(location);
  const here = useRef(location.key); // history entry of the page on screen
  const want = useRef({ location, type });
  want.current = { location, type };
  const pending = useRef(null); // the swap being committed: where to, how, and from which page
  const stopRestore = useRef(() => {});

  // Right after the next page is in the DOM (and, in a transition, before the
  // browser pictures it): put the scroll where it belongs.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p || p.to !== shown) return;
    pending.current = null;
    stopRestore.current();
    here.current = shown.key;
    const y = p.type === 'POP' ? scrolled.get(shown.key) : undefined;
    if (y == null) {
      if (p.fromPath !== shown.pathname) window.scrollTo(0, 0);
      return;
    }
    // The page may still be filling in: keep trying until it's tall enough,
    // and stop the moment the user scrolls for themselves.
    let frame;
    let stop = false;
    const until = Date.now() + 2500;
    const quit = () => {
      stop = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('touchstart', quit);
      window.removeEventListener('wheel', quit);
    };
    const go = () => {
      if (stop) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(y, Math.max(0, max)));
      if (max >= y || Date.now() > until) quit();
      else frame = requestAnimationFrame(go);
    };
    window.addEventListener('touchstart', quit, { passive: true });
    window.addEventListener('wheel', quit, { passive: true });
    stopRestore.current = quit;
    go();
  }, [shown]);

  useEffect(() => {
    if (location === shown) return;
    // The page we're leaving is still on screen: note how far down it was.
    scrolled.set(here.current, window.scrollY);
    const fromPath = shown.pathname;
    let cancelled = false;

    const swap = (sync) => {
      const { location: to, type: how } = want.current; // the newest request wins if several came in
      pending.current = { to, type: how, fromPath };
      if (sync) flushSync(() => setShown(to));
      else setShown(to);
    };

    // Redirects, a new date or week, and hopping between games swap in place.
    const animate =
      typeof document.startViewTransition === 'function' &&
      type !== 'REPLACE' &&
      fromPath !== location.pathname &&
      document.visibilityState === 'visible' &&
      !calm();
    if (!animate) {
      swap(false);
      return;
    }
    (async () => {
      // Have the next page's code ready first, so the transition never lands on a loading placeholder.
      try { await Promise.race([preload?.(location.pathname), new Promise((r) => setTimeout(r, 1200))]); } catch { /* the page shows its own error */ }
      if (cancelled) return;
      let t;
      let swapped = false;
      const once = (sync) => {
        if (swapped) return;
        swapped = true;
        swap(sync);
      };
      try {
        t = document.startViewTransition(() => once(true));
      } catch {
        once(false);
        return;
      }
      // The browser runs the swap on its next frame. If it never gets to it
      // (a stalled or backgrounded page), switch pages without the animation.
      setTimeout(() => {
        if (swapped) return;
        once(false);
        try { t.skipTransition(); } catch { /* already over */ }
      }, 450);
      // Once you're off a game page, no card needs to pair with its header any more.
      t.finished.catch(() => {}).finally(() => { if (!isGame(want.current.location.pathname)) setMorph(null); });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return <Routes location={shown}>{children}</Routes>;
}
