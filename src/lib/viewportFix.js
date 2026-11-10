// iPhone Home Screen apps sometimes keep an old, shorter screen height after
// the keyboard closes or the app is reopened (e.g. from a notification). The
// top bar and bottom tabs are pinned to that wrong height, so they float in
// the middle of the page until the next layout. Nudging the page by one pixel
// makes iOS measure again.
export function startViewportFix() {
  if (typeof window === 'undefined') return;
  let timers = [];
  const nudge = () => {
    const el = document.activeElement;
    if (el && /^(input|textarea)$/i.test(el.tagName)) return; // keyboard is up: leave it alone
    const y = window.scrollY;
    window.scrollTo(window.scrollX, y + 1);
    requestAnimationFrame(() => window.scrollTo(window.scrollX, y));
  };
  // iOS settles in stages, so measure again a few times.
  const soon = () => {
    timers.forEach(clearTimeout);
    timers = [60, 300, 800].map((ms) => setTimeout(nudge, ms));
  };
  document.addEventListener('focusout', (e) => /^(input|textarea)$/i.test(e.target?.tagName ?? '') && soon());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  window.addEventListener('pageshow', soon);
  window.addEventListener('orientationchange', soon);
  window.visualViewport?.addEventListener('resize', soon);

  // The nudge alone isn't enough on newer iOS: after the keyboard closes, the
  // visible screen can stay "panned" down the page by the keyboard's height,
  // which leaves the top bar off-screen and the tabs floating mid-screen.
  // iOS does report that shift, so move the pinned bars by exactly that much.
  const vv = window.visualViewport;
  if (!vv) return;
  let frame = 0;
  const measure = () => {
    frame = 0;
    const typing = /^(input|textarea)$/i.test(document.activeElement?.tagName ?? '');
    // Not while typing (the keyboard really is there) or pinch-zoomed.
    const shift = !typing && Math.abs(vv.scale - 1) < 0.01 ? Math.max(0, Math.round(vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--vv-shift', `${shift}px`);
  };
  const queue = () => { if (!frame) frame = setTimeout(measure, 16); }; // a timer, so it also runs when frames are paused
  vv.addEventListener('resize', queue);
  vv.addEventListener('scroll', queue);
  window.addEventListener('scroll', queue, { passive: true });
  document.addEventListener('focusin', queue);
  document.addEventListener('focusout', () => [0, 150, 400, 900].forEach((ms) => setTimeout(queue, ms)));
  document.addEventListener('visibilitychange', queue);
  measure();
}
