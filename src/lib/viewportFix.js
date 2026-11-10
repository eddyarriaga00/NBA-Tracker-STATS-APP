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
}
