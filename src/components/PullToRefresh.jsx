import { useEffect, useRef, useState } from 'react';

const TRIGGER = 62; // how far the pull has to come down (after resistance) to refresh
const MAX = 92;
const HINT_KEY = 'pullHint'; // 'done' once used; otherwise how many times the hint was shown
const HINT_VIEWS = 6;

const readHint = () => {
  try { return localStorage.getItem(HINT_KEY) ?? '0'; } catch { return 'done'; }
};

/**
 * Pull down at the top of a page to refresh it. `onRefresh` may return a
 * promise; the spinner stays until it settles. With `hint`, touch devices see a
 * small "Pull down to refresh" line the first few visits, until they've used it.
 */
export default function PullToRefresh({ onRefresh, hint = false }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const fn = useRef(onRefresh);
  fn.current = onRefresh;
  const st = useRef({ on: false, sure: false, x: 0, y: 0, pull: 0, busy: false });

  useEffect(() => {
    if (!hint || !(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return; // touch screens only
    const seen = readHint();
    if (seen === 'done' || Number(seen) >= HINT_VIEWS) return;
    setShowHint(true);
    try { localStorage.setItem(HINT_KEY, String(Number(seen) + 1)); } catch { /* ignore */ }
  }, [hint]);

  useEffect(() => {
    const s = st.current;
    const start = (e) => {
      // Only from the very top, with one finger, and not while a sheet or dialog is open.
      s.on = !s.busy && e.touches.length === 1 && window.scrollY <= 0 && !e.target.closest?.('[role="dialog"]');
      s.sure = false;
      s.pull = 0;
      s.x = e.touches[0].clientX;
      s.y = e.touches[0].clientY;
    };
    const move = (e) => {
      if (!s.on) return;
      const dx = e.touches[0].clientX - s.x;
      const dy = e.touches[0].clientY - s.y;
      if (!s.sure) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // A sideways swipe (the date strip, a table) or an upward scroll isn't a pull.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { s.on = false; return; }
        s.sure = true;
        setDragging(true);
      }
      if (e.cancelable) e.preventDefault(); // we move the page ourselves
      s.pull = Math.min(MAX, Math.max(0, dy) * 0.5);
      setPull(s.pull);
    };
    const end = async () => {
      if (!s.on || !s.sure) { s.on = false; return; }
      s.on = false;
      setDragging(false);
      if (s.pull < TRIGGER) { setPull(0); return; }
      s.busy = true;
      setBusy(true);
      setPull(46);
      try {
        // Long enough to see it happen, even when the refresh is instant.
        await Promise.all([Promise.resolve(fn.current?.()).catch(() => {}), new Promise((r) => setTimeout(r, 650))]);
      } finally {
        s.busy = false;
        setBusy(false);
        setPull(0);
        setShowHint(false);
        try { localStorage.setItem(HINT_KEY, 'done'); } catch { /* ignore */ }
      }
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, []);

  const ready = pull >= TRIGGER;
  const turn = Math.min(1, pull / TRIGGER);
  return (
    <>
      <div
        aria-hidden={!busy && pull === 0}
        role="status"
        className="flex items-end justify-center overflow-hidden"
        style={{ height: pull, transition: dragging ? 'none' : 'height 0.22s cubic-bezier(.2,.8,.2,1)' }}
      >
        <div className="flex items-center gap-2 pb-2.5 text-[12.5px] font-semibold text-label-2">
          <svg
            viewBox="0 0 24 24"
            className={`h-[18px] w-[18px] ${busy ? 'animate-spin text-accent' : ready ? 'text-accent' : 'text-label-3'}`}
            style={busy ? undefined : { transform: `rotate(${turn * 270}deg)`, opacity: 0.35 + turn * 0.65 }}
            fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M20 12a8 8 0 1 1-2.6-5.9" />
            <path d="M20 4v4.5h-4.5" />
          </svg>
          {busy ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      </div>
      {showHint && pull === 0 && !busy && (
        <div className="-mt-1 mb-1.5 flex items-center justify-center gap-1 text-[11.5px] font-medium text-label-3">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          Pull down to refresh
        </div>
      )}
    </>
  );
}
