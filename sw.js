// Service worker:
// - shows game alerts sent by the server, even when the app is closed, and
//   keeps the unread count on the app icon;
// - keeps a copy of the app and the latest ESPN data so the app opens
//   instantly and still shows the last scores with no signal.
const APP = 'app-v1'; // the page, scripts, styles and icons
const DATA = 'espn-v1'; // last ESPN responses (used only when offline)
const IMG = 'img-v1'; // team logos and headshots
const ESPN_DATA = /^https:\/\/(site\.api|site\.web\.api|sports\.core\.api)\.espn\.com\//;
const ESPN_IMG = /^https:\/\/a\.espncdn\.com\//;

const scope = () => self.registration.scope;
// While developing (sw.js?v=dev) nothing is cached, so code changes show up.
const DEV = new URL(self.location.href).searchParams.get('v') === 'dev';

// Install: save the whole current version (page + every script/style file).
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      if (DEV) return self.skipWaiting();
      try {
        const r = await fetch(new URL('version.json', scope()), { cache: 'no-store' });
        const { assets = [] } = await r.json();
        const cache = await caches.open(APP);
        await cache.addAll([scope(), ...assets.map((a) => new URL(a, scope()).href)]);
        // Drop files from older versions (they're still online if an old tab asks).
        const keep = new Set([scope(), ...assets.map((a) => new URL(a, scope()).href)]);
        for (const req of await cache.keys()) {
          if (/\/assets\//.test(req.url) && !keep.has(req.url)) await cache.delete(req);
        }
      } catch {
        /* offline during install: files get saved as they're used */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (![APP, DATA, IMG].includes(k)) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// Network first; the saved copy is only used when the network fails.
async function networkFirst(req, name, cacheKey = req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      caches.open(name).then((c) => c.put(cacheKey, copy)).then(() => name === DATA && trim(DATA, 400));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(cacheKey, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

// Saved copy first (files with a hash in their name never change).
async function cacheFirst(req, name, max) {
  // ignoreVary: module scripts send an Origin header that saved copies lack.
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    const copy = res.clone();
    caches.open(name).then((c) => c.put(req, copy)).then(() => max && trim(name, max));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (DEV || req.method !== 'GET') return;
  const url = req.url;

  if (req.mode === 'navigate' && url.startsWith(scope())) {
    // Always try for the newest page; fall back to the saved one offline.
    event.respondWith(networkFirst(req, APP, scope()));
    return;
  }
  if (url.startsWith(scope())) {
    if (/version\.json|sw\.js/.test(url)) return; // always live
    if (/\/assets\//.test(url)) event.respondWith(cacheFirst(req, APP));
    else event.respondWith(networkFirst(req, APP));
    return;
  }
  if (ESPN_DATA.test(url)) {
    // Ignore cache-busting params so offline lookups still match.
    const key = new URL(url);
    key.searchParams.delete('_');
    event.respondWith(networkFirst(req, DATA, key.href));
    return;
  }
  if (ESPN_IMG.test(url)) event.respondWith(cacheFirst(req, IMG, 600));
});

// ---- alerts ----

async function updateBadge() {
  try {
    const shown = await self.registration.getNotifications();
    if (shown.length) await self.navigator.setAppBadge?.(shown.length);
    else await self.navigator.clearAppBadge?.();
  } catch {
    /* badges not supported */
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'NBA Tracker', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'NBA Tracker';
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: data.body || '',
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: data.tag || undefined, // replaces an older alert for the same game
        // Live score updates replace themselves quietly where the phone allows it.
        silent: data.quiet === true,
        renotify: false,
        data: { url: data.url || './' },
      })
      .then(updateBadge)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', scope()).href;
  event.waitUntil(
    (async () => {
      await updateBadge();
      // Leave a note for the app as well: iPhone often just brings the app to
      // the front (or opens its home screen) without going to the link.
      try {
        const cache = await caches.open(APP);
        await cache.put(new URL('__open', scope()).href, new Response(JSON.stringify({ url: target, at: Date.now() })));
      } catch { /* the message below still works */ }
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(scope())) {
          w.postMessage({ type: 'open', url: target }); // the app goes to the game itself
          await w.focus().catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});

// The app asks this when it's opened: alerts count as read.
self.addEventListener('message', (event) => {
  if (event.data === 'read-alerts') {
    event.waitUntil(
      (async () => {
        for (const n of await self.registration.getNotifications()) n.close();
        await self.navigator.clearAppBadge?.();
      })()
    );
  }
});
