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

// After a new version is published, an app that was already open can ask for
// a page file from the old version. Reload once onto the new version instead
// of showing an error.
const CHUNK_RELOAD = 'chunkReloadAt';
export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD) || 0);
    if (Date.now() - last < 60_000) return false; // already tried: let the error show
    sessionStorage.setItem(CHUNK_RELOAD, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

/** Like import(), but a missing file from an old version reloads the app. */
export function loadPage(load) {
  return () =>
    load().catch((err) => {
      if (reloadForNewVersion()) return new Promise(() => {}); // keep the spinner until the reload
      throw err;
    });
}

if (typeof window !== 'undefined') {
  // Vite raises this for any other lazily loaded file (comments, charts…).
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewVersion()) e.preventDefault();
  });
}
