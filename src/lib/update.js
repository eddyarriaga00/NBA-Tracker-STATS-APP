// Keeps phones on the newest version of the site. When the app is opened or
// comes back to the screen, it checks version.json; if a newer build is out,
// it reloads once (your page and settings stay where they were).

const CHECK_EVERY = 5 * 60_000;
const RELOADED_FOR = 'reloadedFor';

async function check() {
  try {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { id } = await r.json();
    if (!id || id === __BUILD_ID__) return;
    // Only once per new build, so a stale cache can never cause a reload loop.
    if (sessionStorage.getItem(RELOADED_FOR) === id) return;
    sessionStorage.setItem(RELOADED_FOR, id);
    location.reload();
  } catch {
    /* offline or blocked: try again later */
  }
}

export function watchForUpdates() {
  if (import.meta.env.DEV) return;
  let last = 0;
  const maybe = () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
    last = Date.now();
    check();
  };
  maybe();
  document.addEventListener('visibilitychange', maybe);
  window.addEventListener('focus', maybe);
  setInterval(maybe, CHECK_EVERY);
}
