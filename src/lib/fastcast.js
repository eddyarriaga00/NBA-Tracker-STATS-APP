// ESPN's push feed (the one espn.com uses for its own live pages). A socket
// sends each change a fraction of a second after it happens, as JSON patches
// on top of a snapshot. Free, no login. If it can't connect, pages simply keep
// polling as before.
const HOST = 'https://fastcast.semfs.engsvc.go.com/public/websockethost';

const topics = new Map(); // topic -> { subs, doc, prefix, chain }
let ws = null;
let sid = null;
let retry = 0;
let timer = null;

async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const text = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text();
  return JSON.parse(text);
}

/** Apply JSON-patch operations in place; an operation that doesn't fit is skipped. */
function apply(doc, ops, seen) {
  for (const op of ops) {
    try {
      const keys = op.path.split('/');
      if (keys[0] === '') keys.shift();
      const last = keys.pop();
      let at = doc;
      // The scoreboard feed names list items by their uid ("s:40~l:46~e:401…") instead of by position.
      for (const k of keys) at = Array.isArray(at) && !/^\d+$/.test(k) ? at.find((x) => x?.uid === k) : at[k];
      if (Array.isArray(at)) {
        const i = last === '-' ? at.length : Number(last);
        if (op.op === 'add') at.splice(i, 0, op.value);
        else if (op.op === 'remove') at.splice(i, 1);
        else if (op.op === 'replace') at[i] = op.value;
      } else if (op.op === 'remove') delete at[last];
      else if (op.op === 'add' || op.op === 'replace') at[last] = op.value;
    } catch { if (seen) seen.missed = (seen.missed ?? 0) + 1; }
  }
}

function tell(t, live) {
  for (const cb of t.subs) {
    try { cb(t.doc, live); } catch { /* one listener must not stop the rest */ }
  }
}

function onMessage(m) {
  const t = topics.get(m.tc);
  if (!t) return;
  if (m.op === 'H') {
    // A fresh snapshot; the patches that follow build on it.
    t.chain = t.chain.then(async () => {
      const doc = await (await fetch(m.pl)).json();
      t.doc = t.prefix ? { [t.prefix.slice(1)]: doc[t.prefix.slice(1)] } : doc;
      t.root = t.pick ? t.pick(t.doc) : t.doc;
      tell(t, false);
    }).catch(() => {});
  } else if (m.op === 'R' || m.op === 'P') {
    t.chain = t.chain.then(async () => {
      const p = JSON.parse(m.pl);
      let ops = p['~c'] ? await inflate(p.pl) : typeof p.pl === 'string' ? JSON.parse(p.pl) : p.pl;
      if (!Array.isArray(ops)) return;
      if (t.prefix) ops = ops.filter((o) => o.path?.startsWith(t.prefix));
      if (t.root && ops.length) apply(t.root, ops, t);
      // Replayed patches only catch the snapshot up; live ones are news.
      if (m.op === 'P' || m.lt) tell(t, m.op === 'P');
    }).catch(() => {});
  }
}

function drop() {
  for (const t of topics.values()) {
    t.doc = null;
    t.root = null;
    tell(t, false);
  }
}

async function connect() {
  clearTimeout(timer);
  if (ws || !topics.size || typeof WebSocket === 'undefined' || typeof DecompressionStream === 'undefined') return;
  const mine = (ws = {}); // placeholder so two callers don't both connect
  try {
    const h = await (await fetch(HOST, { cache: 'no-store' })).json();
    if (ws !== mine || !topics.size) { if (ws === mine) ws = null; return; }
    const sock = new WebSocket(`wss://${h.ip}:${h.securePort}/FastcastService/pubsub/profiles/12000?TrafficManager-Token=${encodeURIComponent(h.token)}`);
    ws = sock;
    sock.onopen = () => sock.send(JSON.stringify({ op: 'C' }));
    sock.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.op === 'C') {
        sid = m.sid;
        retry = 0;
        for (const tc of topics.keys()) sock.send(JSON.stringify({ op: 'S', sid, tc }));
      } else onMessage(m);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      sid = null;
      drop();
      if (topics.size) timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
    };
    sock.onerror = () => sock.close();
  } catch {
    if (ws === mine) ws = null;
    if (topics.size) timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
  }
}

if (typeof document !== 'undefined') {
  // Phones drop sockets in the background; reconnect as soon as the app is back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws && topics.size) { retry = 0; connect(); }
  });
}

/**
 * Follow a topic. `cb(doc, live)` runs with the up-to-date document after each
 * change (`live` is true for a brand-new change), and with `null` when the
 * connection drops. `prefix` (e.g. "/header") keeps only that part of the
 * document; `pick(doc)` returns the part the patches are written against.
 * Returns a function that stops following.
 */
export function follow(topic, cb, { prefix = '', pick = null } = {}) {
  let t = topics.get(topic);
  if (!t) {
    t = { subs: new Set(), doc: null, root: null, prefix, pick, chain: Promise.resolve() };
    topics.set(topic, t);
    if (ws?.readyState === 1 && sid) ws.send(JSON.stringify({ op: 'S', sid, tc: topic }));
  }
  t.subs.add(cb);
  if (t.doc) cb(t.doc, false);
  connect();
  return () => {
    t.subs.delete(cb);
    if (t.subs.size) return;
    topics.delete(topic);
    if (!topics.size && ws?.close) { const s = ws; ws = null; sid = null; s.close(); }
  };
}
