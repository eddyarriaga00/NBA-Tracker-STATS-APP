// Push alerts that arrive even when the app is closed.
// The device registers with the browser's push service, then saves its
// subscription and alert choices to Supabase. A server job sends the alerts.
import { useEffect, useState } from 'react';
import { useFavorites } from './favorites';
import { useSetting } from './settings';
import { commentsEnabled, ensureUser, getClient } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const ACTIVE_KEY = 'pushActive';

export const pushConfigured = !!(VAPID && commentsEnabled);
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** True when this device gets server alerts (so in-app alerts can stand down). */
export const pushActive = () => {
  try { return localStorage.getItem(ACTIVE_KEY) === '1'; } catch { return false; }
};
const setActive = (on) => {
  try { on ? localStorage.setItem(ACTIVE_KEY, '1') : localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('push'));
};

// Latest alert status, readable from any page (Settings shows it).
let lastStatus = null;
const publish = (s) => {
  lastStatus = s;
  window.dispatchEvent(new Event('push-status'));
};
export function usePushStatus() {
  const [s, setS] = useState(lastStatus);
  useEffect(() => {
    const on = () => setS(lastStatus);
    window.addEventListener('push-status', on);
    return () => window.removeEventListener('push-status', on);
  }, []);
  return s;
}

/** Keeps this device's saved alert choices in sync with settings and followed teams. */
export function usePushSync() {
  const [followedOn] = useSetting('alertsFollowed');
  const [closeOn] = useSetting('alertsClose');
  const [spoiler] = useSetting('spoilerFree');
  const { favs } = useFavorites();
  const [status, setStatus] = useState(null);
  const favKey = favs.join(',');
  useEffect(() => {
    if (!pushConfigured) return;
    let alive = true;
    const run = () =>
      syncPush({ followed: favs, followedOn, closeOn, spoiler })
        .then((r) => alive && (setStatus(r), publish(r)))
        .catch((e) => {
          const r = { ok: false, reason: 'error', message: e?.message };
          if (alive) (setStatus(r), publish(r));
        });
    const t = setTimeout(run, 400); // settle rapid toggles
    // Re-sync once notification permission is granted from the settings toggle.
    window.addEventListener('notification-permission', run);
    return () => {
      alive = false;
      clearTimeout(t);
      window.removeEventListener('notification-permission', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedOn, closeOn, spoiler, favKey]);
  return status;
}

export async function registerServiceWorker() {
  // Registered everywhere service workers exist (offline copy), not just where push works.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    // The build id in the URL makes phones install each new version's worker,
    // which saves that version for offline use. Alerts stay subscribed.
    const v = import.meta.env.DEV ? 'dev' : __BUILD_ID__;
    return await navigator.serviceWorker.register(`./sw.js?v=${v}`, { scope: './' });
  } catch {
    return null;
  }
}

const urlB64ToUint8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/**
 * Turn server alerts on/off for this device and save its choices.
 * prefs: { followed: ['nba:13', ...], followedOn, closeOn, spoiler }
 * Returns { ok, reason } so the settings menu can explain what happened.
 */
export async function syncPush(prefs) {
  if (!pushConfigured) return { ok: false, reason: 'not-configured' };
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  const wantAny = prefs.followedOn || prefs.closeOn;
  const reg = (await navigator.serviceWorker.getRegistration('./')) || (await registerServiceWorker());
  if (!reg) return { ok: false, reason: 'unsupported' };
  let sub = await reg.pushManager.getSubscription();
  const sb = await getClient();

  if (!wantAny) {
    if (sub) {
      await ensureUser().catch(() => {});
      await sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => {});
    }
    setActive(false);
    return { ok: true, reason: 'off' };
  }

  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-home-screen' };
  // Permission is requested by the settings toggle (it must come from a tap on iPhone).
  if (Notification.permission === 'default') return { ok: false, reason: 'needs-permission' };
  if (Notification.permission !== 'granted') {
    setActive(false);
    return { ok: false, reason: 'denied' };
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID) });
  }
  await ensureUser();
  const json = sub.toJSON();
  // Saved through a locked-down database function: devices can't read or edit
  // anyone else's subscription.
  const { error } = await sb.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_followed: prefs.followedOn ? prefs.followed : [],
    p_close: !!prefs.closeOn,
    p_spoiler: !!prefs.spoiler,
  });
  if (error) {
    setActive(false);
    return { ok: false, reason: 'save-failed', message: error.message };
  }
  setActive(true);
  return { ok: true, reason: 'on' };
}

/** Opening the app counts alerts as read: clears the number on the app icon. */
export function clearAlertBadgeOnOpen() {
  if (typeof document === 'undefined') return;
  const clear = () => {
    if (document.visibilityState !== 'visible') return;
    try {
      navigator.clearAppBadge?.().catch(() => {});
      navigator.serviceWorker?.controller?.postMessage('read-alerts');
    } catch {
      /* badges not supported */
    }
  };
  clear();
  document.addEventListener('visibilitychange', clear);
}
