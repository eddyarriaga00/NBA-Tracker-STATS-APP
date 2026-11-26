// Crash reports: when something breaks on someone's phone, a short note (what
// broke, on which page, which browser) goes to the error_log table in Supabase.
// No personal data, at most a few per visit, nothing in development.

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MAX_PER_VISIT = 5;
const sent = new Set();

// Noise that isn't a bug in the app: flaky connections, browser quirks, extensions.
const IGNORE = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|network connection was lost|AbortError|The operation was aborted|Importing a module script failed|Failed to fetch dynamically imported module|chrome-extension:|moz-extension:|safari-extension:/i;

export function reportCrash(error, where = '') {
  if (import.meta.env.DEV || !url || !key) return;
  const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 480);
  const stack = String(error?.stack ?? '').slice(0, 3800);
  if (!message || IGNORE.test(message) || IGNORE.test(stack)) return;
  const sig = `${where}|${message}`;
  if (sent.has(sig) || sent.size >= MAX_PER_VISIT) return;
  sent.add(sig);
  const body = {
    message: where ? `[${where}] ${message}`.slice(0, 500) : message,
    stack: stack || null,
    page: location.hash.slice(0, 300) || '#/',
    version: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__.slice(0, 40) : null,
    agent: navigator.userAgent.slice(0, 300),
  };
  try {
    fetch(`${url}/rest/v1/error_log`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let reporting break anything */
  }
}

export function startCrashReports() {
  window.addEventListener('error', (e) => reportCrash(e.error ?? e.message, 'error'));
  window.addEventListener('unhandledrejection', (e) => reportCrash(e.reason, 'promise'));
}
