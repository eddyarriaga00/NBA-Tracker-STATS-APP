// When you're signed in, your followed teams and preferences follow your
// account to every device. Alerts stay per device (each phone asks for its own
// notification permission).
//
// Stored in the account's metadata as { prefs: { ...values, updatedAt } }.
// - First time a device signs in to an account: followed teams are merged
//   (nothing you followed on either side is lost) and the account's
//   preferences win.
// - After that: whichever side changed last wins.
import { getClient } from './supabase';

const SYNCED = {
  favoriteTeams: { key: 'favoriteTeams', raw: true, event: 'favorites' },
  theme: { key: 'theme', raw: true, plain: true, event: 'theme' },
  spoilerFree: { key: 'setting:spoilerFree', event: 'settings' },
  defaultLeague: { key: 'setting:defaultLeague', event: 'settings' },
  gameSort: { key: 'gameSort', raw: true, plain: true, event: 'gameSort' },
};
const LOCAL_AT = 'prefsUpdatedAt';
const SYNCED_USER = 'prefsSyncedUser';

const get = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const put = (k, v) => {
  try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignore */ }
};

function readLocal() {
  const out = {};
  for (const [name, s] of Object.entries(SYNCED)) {
    const v = get(s.key);
    if (v == null) continue;
    try {
      out[name] = s.plain ? v : JSON.parse(v);
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

let applying = false;
function writeLocal(prefs) {
  applying = true;
  const events = new Set();
  for (const [name, s] of Object.entries(SYNCED)) {
    if (!(name in prefs)) continue;
    const v = s.plain ? String(prefs[name]) : JSON.stringify(prefs[name]);
    if (get(s.key) !== v) {
      put(s.key, v);
      events.add(s.event);
    }
  }
  for (const e of events) window.dispatchEvent(new Event(e));
  applying = false;
}

async function signedInUser() {
  const sb = await getClient();
  if (!sb) return {};
  const { data } = await sb.auth.getUser(); // fresh from the server, not the cached session
  const u = data.user;
  return { sb, user: u && !u.is_anonymous ? u : null };
}

let pushTimer;
async function push() {
  const { sb, user } = await signedInUser();
  if (!user) return;
  const at = Number(get(LOCAL_AT) || Date.now());
  await sb.auth.updateUser({ data: { prefs: { ...readLocal(), updatedAt: at } } });
}

/** Pull (or merge) the account's preferences into this device. */
export async function syncNow() {
  const { user } = await signedInUser();
  if (!user) return;
  const remote = user.user_metadata?.prefs;
  const localAt = Number(get(LOCAL_AT) || 0);
  const firstTime = get(SYNCED_USER) !== user.id;
  if (!remote) {
    put(SYNCED_USER, user.id);
    if (!get(LOCAL_AT)) put(LOCAL_AT, String(Date.now()));
    return push();
  }
  if (firstTime) {
    const local = readLocal();
    const favs = [...new Set([...(remote.favoriteTeams ?? []), ...(local.favoriteTeams ?? [])])];
    writeLocal({ ...remote, favoriteTeams: favs });
    put(SYNCED_USER, user.id);
    put(LOCAL_AT, String(Date.now()));
    return push();
  }
  if ((remote.updatedAt ?? 0) > localAt) {
    writeLocal(remote);
    put(LOCAL_AT, String(remote.updatedAt));
  } else if (localAt > (remote.updatedAt ?? 0)) {
    return push();
  }
}

/** Starts syncing: on launch, when you sign in, when the app comes back, and after every change. */
export function startSync() {
  // Only load Supabase at launch if this device has ever signed in.
  const hasSession = () => {
    try {
      return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
    } catch {
      return false;
    }
  };
  const run = () => hasSession() && syncNow().catch(() => {});
  run();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  window.addEventListener('signed-in', run);

  const changed = () => {
    if (applying) return;
    put(LOCAL_AT, String(Date.now()));
    if (!hasSession()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => push().catch(() => {}), 1200);
  };
  for (const e of ['favorites', 'settings', 'theme-changed', 'gameSort']) window.addEventListener(e, changed);
}
