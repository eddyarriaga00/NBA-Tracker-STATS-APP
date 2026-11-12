// Supabase Edge Function: called every minute (pg_cron). Each call checks ESPN
// six times, 10 seconds apart, and sends web push alerts: game starting,
// halftime, final, close games late, and big performances.
// In between, it listens to ESPN's push feed (the one espn.com uses) and checks
// again the moment a game starts, reaches halftime, turns close or ends, so
// those alerts go out a second or two after the fact instead of up to ten.
// Each alert goes out once per game, tracked in alert_game_state.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { bigMoments, worthSending } from './big.js';
import { liveCard } from './live.js';

const SITE = 'https://eddyarriaga00.github.io/NBA-Tracker-STATS-APP/';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

type Team = { id: string; abbr: string; score: number; winner: boolean };
type Game = {
  key: string; league: 'nba' | 'nfl'; id: string; state: string; completed: boolean; start: string; half: boolean;
  period: number; clock: string; label: string; broadcast: string; home: Team; away: Team;
  off: boolean; // postponed, cancelled or delayed
  top: string; // NBA top scorer so far, e.g. "L. Doncic 38 PTS"
};

// ---- same "close game" rules as the app (src/lib/excitement.js) ----
const CLOSE = { nba: 5, nfl: 8 };
const secs = (c: string) => (c.includes(':') ? c.split(':').reduce((m, x, i) => m + Number(x) * (i ? 1 : 60), 0) : Number(c) || 0);
function hot(g: Game): string | null {
  if (g.state !== 'in') return null;
  if (g.period > 4) return 'Overtime';
  const late = g.period === 4 && secs(g.clock) <= (g.league === 'nfl' ? 480 : 360);
  return late && Math.abs(g.home.score - g.away.score) <= CLOSE[g.league] ? 'Close game' : null;
}

function norm(league: 'nba' | 'nfl', e: any): Game | null {
  const c = e.competitions?.[0];
  if (!c) return null;
  const side = (h: string): Team => {
    const x = c.competitors.find((t: any) => t.homeAway === h);
    const score = typeof x?.score === 'object' ? x?.score?.value : x?.score;
    return { id: x?.team?.id ?? x?.id, abbr: x?.team?.abbreviation, score: Number(score) || 0, winner: x?.winner === true };
  };
  const st = e.status ?? c.status;
  let top = '';
  if (league === 'nba') {
    let best = 0;
    for (const t of c.competitors ?? []) {
      const l = (t.leaders ?? []).find((x: any) => x.name === 'points')?.leaders?.[0];
      const v = Number(l?.value ?? parseFloat(l?.displayValue));
      if (l?.athlete && v > best) { best = v; top = `${l.athlete.shortName ?? l.athlete.displayName} ${Math.round(v)} PTS`; }
    }
  }
  return {
    key: `${league}:${e.id}`, league, id: String(e.id),
    state: st?.type?.state ?? 'pre', completed: st?.type?.completed === true, start: c.date ?? e.date,
    // ESPN takes most of a minute to say "Halftime"; the clock hitting zero in the 2nd says it first.
    half: st?.type?.name === 'STATUS_HALFTIME' || /^halftime$/i.test(st?.type?.shortDetail ?? '') ||
      (st?.type?.state === 'in' && st?.period === 2 && /^0?:?0?0(\.0)?$/.test(String(st?.displayClock ?? ''))),
    period: st?.period ?? 0, clock: String(st?.displayClock ?? ''),
    label: st?.type?.shortDetail ?? '',
    broadcast: c.broadcast || (c.broadcasts ?? []).flatMap((b: any) => b.names ?? []).join(', ') || '',
    home: side('home'), away: side('away'),
    off: /POSTPONED|CANCEL|DELAY|SUSPEND/i.test(st?.type?.name ?? ''),
    top,
  };
}

// ESPN turns away bare server requests, so look like a normal browser and
// fall back to its second API host if the first one refuses.
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  origin: 'https://www.espn.com',
  referer: 'https://www.espn.com/',
};
async function json(url: string) {
  const bust = `${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
  const hosts = [url, url.replace('site.api.espn.com/apis/site', 'site.web.api.espn.com/apis/site')];
  let last = '';
  // Two rounds: ESPN drops the odd connection.
  for (const u of [...hosts, ...hosts]) {
    try {
      const r = await fetch(u + bust, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
      if (r.ok) return await r.json();
      last = `${r.status} ${u}`;
    } catch (e: any) {
      last = `${e?.message ?? e} ${u}`;
    }
  }
  throw new Error(last);
}

const loadErrors: string[] = [];
async function loadGames(): Promise<Game[]> {
  loadErrors.length = 0;
  // NBA "today" follows US Eastern time; keep yesterday until 5am ET for late games.
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const key = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const days = [key(et)];
  if (et.getHours() < 5) days.push(key(new Date(et.getFullYear(), et.getMonth(), et.getDate() - 1)));
  const urls: [('nba' | 'nfl'), string][] = [
    ...days.map((d) => ['nba', `${ESPN}/basketball/nba/scoreboard?dates=${d}`] as ['nba', string]),
    ['nfl', `${ESPN}/football/nfl/scoreboard`],
  ];
  const out: Game[] = [];
  // Keep the league attached to each response.
  const results = await Promise.allSettled(urls.map(([lg, u]) => json(u).then((d) => [lg, d] as const)));
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      loadErrors.push(String(r.reason?.message ?? r.reason).slice(0, 200));
      continue;
    }
    const [lg, d] = r.value;
    for (const e of d.events ?? []) {
      const g = norm(lg, e);
      if (g && g.home.id && g.away.id && Number(g.home.id) > 0) out.push(g);
    }
  }
  return out;
}

const PATH = { nba: 'basketball/nba', nfl: 'football/nfl' };

// ---- ESPN's push feed: used only to know *when* to look, never as the data ----
const FASTCAST = 'https://fastcast.semfs.engsvc.go.com/public/websockethost';
const TOPICS: Record<string, 'nba' | 'nfl'> = { 'event-basketball-nba': 'nba', 'event-football-nfl': 'nfl' };
const followed = new Set<string>(); // games someone follows live: every score matters there
const seen = new Map<string, Game>(); // each game as the last look had it

/**
 * A small WebSocket client over a plain TLS connection. The runtime's own
 * WebSocket insists on HTTP/2 for secure sockets, which the feed doesn't speak.
 * Text messages only, which is all the feed sends.
 */
class MiniSocket {
  onopen: () => void = () => {};
  onmessage: (ev: { data: string }) => void = () => {};
  onclose: (ev: { code: number }) => void = () => {};
  onerror: (ev: { message: string }) => void = () => {};
  #conn: Deno.TlsConn | null = null;
  #closed = false;
  constructor(host: string, port: number, path: string) {
    this.#run(host, port, path).catch((e) => {
      if (!this.#closed) this.onerror({ message: String(e?.message ?? e) });
      this.#end(1006);
    });
  }
  #end(code: number) {
    if (this.#closed) return;
    this.#closed = true;
    try { this.#conn?.close(); } catch { /* already closed */ }
    this.onclose({ code });
  }
  async #run(host: string, port: number, path: string) {
    const conn = (this.#conn = await Deno.connectTls({ hostname: host, port, alpnProtocols: ['http/1.1'] }));
    const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    await conn.write(new TextEncoder().encode(
      `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: https://www.espn.com\r\n\r\n`));
    let buf = new Uint8Array(0);
    const chunk = new Uint8Array(32 * 1024);
    const more = async () => {
      const n = await conn.read(chunk);
      if (n === null) return false;
      const next = new Uint8Array(buf.length + n);
      next.set(buf);
      next.set(chunk.subarray(0, n), buf.length);
      buf = next;
      return true;
    };
    // The reply to the handshake ends at the first blank line.
    let headEnd = -1;
    while (headEnd < 0) {
      if (!(await more())) throw new Error('closed during handshake');
      for (let i = 0; i + 3 < buf.length; i++) if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) { headEnd = i + 4; break; }
    }
    const head = new TextDecoder().decode(buf.subarray(0, headEnd));
    if (!/^HTTP\/1\.1 101/.test(head)) throw new Error(`handshake refused: ${head.split('\r\n')[0]}`);
    buf = buf.slice(headEnd);
    this.onopen();
    const parts: Uint8Array[] = [];
    while (!this.#closed) {
      // One frame: 2 header bytes, an optional longer length, then the payload (servers don't mask).
      while (buf.length < 2) if (!(await more())) return this.#end(1006);
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        while (buf.length < 4) if (!(await more())) return this.#end(1006);
        len = (buf[2] << 8) | buf[3];
        at = 4;
      } else if (len === 127) {
        while (buf.length < 10) if (!(await more())) return this.#end(1006);
        len = Number(new DataView(buf.buffer, buf.byteOffset + 2, 8).getBigUint64(0));
        at = 10;
      }
      while (buf.length < at + len) if (!(await more())) return this.#end(1006);
      const body = buf.slice(at, at + len);
      buf = buf.slice(at + len);
      if (op === 8) return this.#end(1000);
      if (op === 9) { await this.#frame(10, body); continue; } // ping -> pong
      if (op === 10) continue;
      parts.push(body);
      if (!fin) continue;
      const size = parts.reduce((n, p) => n + p.length, 0);
      const all = new Uint8Array(size);
      let o = 0;
      for (const p of parts) { all.set(p, o); o += p.length; }
      parts.length = 0;
      this.onmessage({ data: new TextDecoder().decode(all) });
    }
  }
  async #frame(op: number, body: Uint8Array) {
    if (!this.#conn || this.#closed) return;
    const mask = crypto.getRandomValues(new Uint8Array(4));
    const head = body.length < 126 ? [0x80 | op, 0x80 | body.length] : [0x80 | op, 0x80 | 126, body.length >> 8, body.length & 0xff];
    const out = new Uint8Array(head.length + 4 + body.length);
    out.set(head);
    out.set(mask, head.length);
    for (let i = 0; i < body.length; i++) out[head.length + 4 + i] = body[i] ^ mask[i % 4];
    await this.#conn.write(out);
  }
  send(text: string) { this.#frame(1, new TextEncoder().encode(text)).catch(() => this.#end(1006)); }
  close() { this.#end(1000); }
}

async function inflate(b64: string) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'))).text());
}

/** Patch the feed's list of games in place. Its paths name a game by uid, then the field. */
function patch(events: any[], ops: any[]) {
  for (const op of ops) {
    try {
      const keys = String(op.path).split('/');
      if (keys[0] === '') keys.shift();
      const last = keys.pop()!;
      let at: any = events;
      for (const k of keys) at = Array.isArray(at) && !/^\d+$/.test(k) ? at.find((x: any) => x?.uid === k) : at[k];
      if (op.op === 'remove') delete at[last];
      else at[last] = op.value;
    } catch { /* a field this copy doesn't have */ }
  }
}

/** What matters for alerts about one game in the feed, as a short string. */
function pushSig(lg: 'nba' | 'nfl', e: any) {
  const st = e.fullStatus ?? {};
  const side = (h: string) => Number(e.competitors?.find((c: any) => c.homeAway === h)?.score) || 0;
  const state = st.type?.state ?? e.status ?? 'pre';
  const period = Number(st.period ?? e.period) || 0;
  const clock = String(st.displayClock ?? e.clock ?? '');
  const half = st.type?.name === 'STATUS_HALFTIME' || (state === 'in' && period === 2 && /^0?:?0?0(\.0)?$/.test(clock));
  const g = { state, period, clock, league: lg, home: { score: side('home') }, away: { score: side('away') } } as Game;
  const key = `${lg}:${e.id}`;
  return { key, state, home: g.home.score, away: g.away.score, sig: `${state}|${half}|${hot(g) ?? ''}${followed.has(key) ? `|${g.home.score}-${g.away.score}` : ''}` };
}

/**
 * Listen to the feed until `until` (ms). Calls `onChange(key, want)` when a
 * game's alert-relevant state changes; `want` is what the feed now says.
 */
async function listen(until: number, onChange: (key: string, want: { state: string; home: number; away: number }) => void, stats: Record<string, unknown> = {}) {
  const h = await (await fetch(FASTCAST, { headers: HEADERS, signal: AbortSignal.timeout(5000) })).json();
  const ws = new MiniSocket(h.ip, h.securePort, `/FastcastService/pubsub/profiles/12000?TrafficManager-Token=${encodeURIComponent(h.token)}`);
  const docs: Record<string, any[] | null> = {};
  const sigs = new Map<string, string>();
  const chains: Record<string, Promise<void>> = {};
  let patches = 0;
  const look = (tc: string, live: boolean) => {
    for (const e of docs[tc] ?? []) {
      const s = pushSig(TOPICS[tc], e);
      const was = sigs.get(s.key);
      sigs.set(s.key, s.sig);
      if (live && was !== undefined && was !== s.sig) onChange(s.key, s);
    }
  };
  ws.onopen = () => { stats.opened = true; ws.send(JSON.stringify({ op: 'C' })); };
  ws.onmessage = (ev: any) => {
    let m: any;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    stats.messages = (Number(stats.messages) || 0) + 1;
    stats.ops = `${stats.ops ?? ''}${m.op}`.slice(0, 40);
    if (m.op === 'C') { for (const tc of Object.keys(TOPICS)) ws.send(JSON.stringify({ op: 'S', sid: m.sid, tc })); return; }
    if (!TOPICS[m.tc]) return;
    const next = async () => {
      if (m.op === 'H') {
        const d = await (await fetch(m.pl, { signal: AbortSignal.timeout(5000) })).json();
        docs[m.tc] = d?.sports?.[0]?.leagues?.[0]?.events ?? null;
        look(m.tc, false);
      } else if (m.op === 'R' || m.op === 'P') {
        const p = JSON.parse(m.pl);
        const ops = p['~c'] ? await inflate(p.pl) : typeof p.pl === 'string' ? JSON.parse(p.pl) : p.pl;
        if (!docs[m.tc] || !Array.isArray(ops)) return;
        patch(docs[m.tc]!, ops);
        patches++;
        look(m.tc, m.op === 'P');
      }
    };
    chains[m.tc] = (chains[m.tc] ?? Promise.resolve()).then(next).catch((e) => { stats.failed = String(e?.message ?? e).slice(0, 120); });
  };
  await new Promise<void>((done) => {
    const t = setTimeout(done, Math.max(0, until - Date.now()));
    ws.onclose = (e: any) => { stats.closed = e.code; clearTimeout(t); done(); };
    ws.onerror = (e: any) => { stats.error = String(e?.message ?? 'error'); clearTimeout(t); done(); };
  });
  try { ws.close(); } catch { /* already closed */ }
  return patches;
}

/** One game from its summary (for picks on games no longer on today's scoreboard). */
async function loadOne(league: 'nba' | 'nfl', id: string): Promise<Game | null> {
  const d = await json(`${ESPN}/${PATH[league]}/summary?event=${id}`);
  const c = d.header?.competitions?.[0];
  if (!c) return null;
  return norm(league, { id, competitions: [c], status: c.status, date: c.date });
}

// ---- Pick'em grading ----
// A pick wins if its team won, pushes on an NFL tie, and is void if it was
// made or changed after the scheduled start (or the game was cancelled).
async function gradePicks(games: Game[]) {
  const nowIso = new Date().toISOString();
  const { data: pending } = await db.from('picks').select('league,game_id').is('result', null).lte('game_start', nowIso).limit(2000);
  const keys = [...new Set((pending ?? []).map((p) => `${p.league}:${p.game_id}`))];
  const loaded = new Map(games.map((g) => [g.key, g]));
  let graded = 0;
  let lookups = 0;
  for (const k of keys) {
    let g = loaded.get(k);
    if (g && g.state !== 'post') continue; // still to play or in progress
    if (!g) {
      if (lookups++ >= 12) continue; // the rest wait for the next minute
      const [lg, id] = k.split(':') as ['nba' | 'nfl', string];
      g = (await loadOne(lg, id).catch(() => null)) ?? undefined;
      if (!g || g.state !== 'post') continue;
    }
    const start = Date.parse(g.start);
    const winner = g.home.winner ? g.home.id : g.away.winner ? g.away.id : null;
    const { data: picks } = await db.from('picks').select('user_id,team_id,updated_at').eq('league', g.league).eq('game_id', g.id).is('result', null);
    const by: Record<string, string[]> = { win: [], loss: [], push: [], void: [] };
    for (const p of picks ?? []) {
      const late = Number.isFinite(start) && Date.parse(p.updated_at) > start;
      const result = !g.completed || late ? 'void' : !winner ? 'push' : p.team_id === winner ? 'win' : 'loss';
      by[result].push(p.user_id);
    }
    for (const [result, users] of Object.entries(by)) {
      if (!users.length) continue;
      await db.from('picks').update({ result }).eq('league', g.league).eq('game_id', g.id).is('result', null).in('user_id', users);
      graded += users.length;
    }
  }
  return graded;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const test = new URL(req.url).searchParams.get('test'); // ?test=1 sends a test alert to every device

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth,user_id,chat,trades,followed,close_games,spoiler_free,scope,starts,halftime,finals,big,start_for,half_for,final_for');
  const subscriptions = subs ?? [];

  const send = async (payload: Record<string, string>, pick: (s: any) => boolean, spoilerBody?: string, spoilerTitle?: string) => {
    let sent = 0;
    await Promise.allSettled(
      subscriptions.filter(pick).map(async (s) => {
        const body = s.spoiler_free && spoilerBody != null ? spoilerBody : payload.body;
        const title = s.spoiler_free && spoilerTitle != null ? spoilerTitle : payload.title;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, title, body }), { TTL: 600, urgency: 'high' });
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // device unsubscribed
        }
      })
    );
    return sent;
  };

  // ?preview=nba:<gameId> lists the big-performance alerts a game would send (sends nothing).
  const preview = new URL(req.url).searchParams.get('preview');
  if (preview) {
    const [lg, id] = preview.split(':') as ['nba' | 'nfl', string];
    const summary = await json(`${ESPN}/${PATH[lg]}/summary?event=${id}`);
    return Response.json({ preview, alerts: worthSending(bigMoments(lg, summary)) });
  }

  // ?feed=1 listens to the push feed for a few seconds and reports what it heard (sends nothing).
  if (new URL(req.url).searchParams.get('feed')) {
    const changes: string[] = [];
    try {
      const stats: Record<string, unknown> = {};
      const patches = await listen(Date.now() + 9000, (key, want) => changes.push(`${key} ${want.state} ${want.away}-${want.home}`), stats);
      return Response.json({ feed: true, patches, changes, stats });
    } catch (e: any) {
      return Response.json({ feed: false, error: String(e?.message ?? e) });
    }
  }

  if (test) {
    const sent = await send({ title: 'NBA Tracker alerts are on', body: 'You’ll get alerts even when the app is closed.', url: SITE, tag: 'test' }, () => true);
    return Response.json({ test: true, devices: subscriptions.length, sent });
  }

  // ?demo=1 sends one alert per game that's live right now, to see alerts working.
  if (new URL(req.url).searchParams.get('demo')) {
    const live = (await loadGames()).filter((g) => g.state === 'in');
    let sent = 0;
    for (const g of live) {
      const line = `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr} · ${g.label}`;
      sent += await send(
        { title: `Live: ${g.away.abbr} at ${g.home.abbr}`, body: g.top ? `${line} · ${g.top}` : line, url: `${SITE}#/${g.league}/game/${g.id}`, tag: `${g.key}:demo` },
        () => true,
        `${g.label} · tap to see the score`
      );
    }
    return Response.json({ demo: true, live: live.map((g) => g.key), sent });
  }

  // New messages in the group chat go to everyone who wants them (not the sender).
  const chatAlerts = async () => {
    const { data: cur } = await db.from('alert_state').select('value').eq('key', 'chat_last_id').maybeSingle();
    if (!cur) {
      // First run: start from now, don't announce old messages.
      const { data: top } = await db.from('comments').select('id').eq('room', 'general').order('id', { ascending: false }).limit(1);
      await db.from('alert_state').upsert({ key: 'chat_last_id', value: String(top?.[0]?.id ?? 0) });
      return 0;
    }
    const { data: fresh } = await db.from('comments').select('id,user_id,author,body').eq('room', 'general').gt('id', Number(cur.value)).order('id').limit(30);
    if (!fresh?.length) return 0;
    // Move the marker first, so a slow send can never announce a message twice.
    await db.from('alert_state').upsert({ key: 'chat_last_id', value: String(fresh[fresh.length - 1].id), updated_at: new Date().toISOString() });
    // Several messages from one person in a row become one alert.
    const groups: { user_id: string; author: string; lines: string[] }[] = [];
    for (const m of fresh) {
      const g = groups[groups.length - 1];
      if (g && g.user_id === m.user_id) g.lines.push(m.body);
      else groups.push({ user_id: m.user_id, author: m.author, lines: [m.body] });
    }
    let n = 0;
    for (const g of groups) {
      const body = g.lines.slice(-4).map((l) => (l.length > 150 ? `${l.slice(0, 149)}…` : l)).join('\n');
      n += await send({ title: `${g.author} in Chat`, body, url: `${SITE}#/chat`, tag: `chat:${fresh[fresh.length - 1].id}:${g.user_id.slice(0, 8)}` }, (s) => s.chat !== false && s.user_id !== g.user_id);
    }
    await db.from('alert_log').insert({ game_key: 'chat', kind: 'chat', title: `${fresh.length} message(s)`, devices: n });
    return n;
  };

  // A trade by a team someone follows. ESPN lists each trade once per team, in
  // that team's words, so followers of either side get their own team's version.
  const tradeAlerts = async () => {
    if (!subscriptions.some((s) => s.trades !== false && (s.followed ?? []).length)) return 0;
    const found: { key: string; lg: string; teamId: string; team: string; text: string }[] = [];
    for (const lg of ['nba', 'nfl'] as const) {
      const d = await json(`${ESPN}/${PATH[lg]}/transactions?limit=40`).catch(() => null);
      for (const t of d?.transactions ?? []) {
        const text = String(t.description ?? '').trim();
        if (!t.team?.id || !/\btraded\b|\bacquired\b/i.test(text)) continue;
        found.push({ key: `${lg}:${t.team.id}:${String(t.date).slice(0, 10)}:${text.length}:${text.slice(0, 40)}`, lg, teamId: String(t.team.id), team: t.team.name ?? t.team.displayName ?? '', text });
      }
    }
    const { data: cur } = await db.from('alert_state').select('value').eq('key', 'trades_seen').maybeSingle();
    const seen: string[] = cur ? JSON.parse(cur.value) : [];
    const fresh = found.filter((f) => !seen.includes(f.key));
    if (!fresh.length) return 0;
    // Remember before sending, so a failure can never repeat an alert.
    await db.from('alert_state').upsert({ key: 'trades_seen', value: JSON.stringify([...fresh.map((f) => f.key), ...seen].slice(0, 400)), updated_at: new Date().toISOString() });
    if (!cur) return 0; // first run: start from now, don't announce old trades
    let n = 0;
    for (const f of fresh.slice(0, 6)) {
      const body = f.text.length > 170 ? `${f.text.slice(0, 169)}…` : f.text;
      const sent = await send({ title: `Trade: ${f.team}`, body, url: `${SITE}#/${f.lg}/moves`, tag: `trade:${f.key}`.slice(0, 60) }, (s) => s.trades !== false && (s.followed ?? []).includes(`${f.lg}:${f.teamId}`));
      n += sent;
      await db.from('alert_log').insert({ game_key: `${f.lg}:trade`, kind: 'trade', title: `${f.team}: ${f.text}`.slice(0, 200), devices: sent });
    }
    return n;
  };

  // One look at ESPN. `n` is which look this is within the minute (0-3).
  const pass = async (n: number, quick = false) => {
  const chatted = quick ? 0 : await chatAlerts().catch((e) => { console.error('chat', e?.message ?? e); return 0; });
  const traded = n === 0 ? await tradeAlerts().catch((e) => { console.error('trades', e?.message ?? e); return 0; }) : 0;
  const games = await loadGames();
  const graded = n === 0 ? await gradePicks(games).catch((e) => `error: ${e?.message ?? e}`) : 0;
  if (!games.length) return { games: 0, graded, chat: chatted, trades: traded, errors: [...loadErrors] };
  const { data: rows } = await db.from('alert_game_state').select('game_key,state,close_sent,half_sent,start_sent,big_sent').in('game_key', games.map((g) => g.key));
  const prev = Object.fromEntries((rows ?? []).map((r) => [r.game_key, r]));

  // Each moment has its own choice per device: 'off', 'teams' (followed teams' games) or 'all'.
  const follows = (g: Game, s: any) => (s.followed ?? []).includes(`${g.league}:${g.home.id}`) || (s.followed ?? []).includes(`${g.league}:${g.away.id}`);
  const wants = (g: Game, moment: 'start' | 'half' | 'final') => (s: any) => {
    const legacy = { start: s.starts, half: s.halftime, final: s.finals }[moment] ? s.scope : 'off';
    const v = s[`${moment}_for`] ?? legacy;
    return v === 'all' || (v === 'teams' && follows(g, s));
  };
  const match = (g: Game) => `${g.away.abbr} at ${g.home.abbr}`;
  const score = (g: Game) => `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr}`;
  const updates: any[] = [];
  const log: any[] = [];
  let events = 0;
  let sent = chatted + traded;
  const anyBig = subscriptions.some((s) => s.big);
  const alert = async (g: Game, kind: string, ...args: Parameters<typeof send>) => {
    events++;
    const n = await send(...args);
    sent += n;
    log.push({ game_key: g.key, kind, title: args[0].title, devices: n });
  };
  // Games someone is following live get a box score on every look.
  const { data: lf } = await db.from('live_follows').select('endpoint,game_key,every,sig,sent_at').in('game_key', games.map((g) => g.key));
  const followers: Record<string, any[]> = {};
  for (const f of lf ?? []) (followers[f.game_key] ??= []).push(f);
  followed.clear();
  for (const k of Object.keys(followers)) followed.add(k);
  for (const g of games) seen.set(g.key, g);
  // Box scores for big performances: every other look, all live games at once.
  const summaries = new Map<string, any>();
  {
    // A game that just ended is always checked, to catch the last minute's stats.
    const live = games.filter((g) =>
      g.state !== 'pre' && followers[g.key] ? true
      : anyBig && ((g.state === 'in' && n % 3 === 0) || (prev[g.key]?.state === 'in' && g.state === 'post')));
    await Promise.all(live.map(async (g) => summaries.set(g.key, await json(`${ESPN}/${PATH[g.league]}/summary?event=${g.id}`).catch(() => null))));
  }
  const now = Date.now();

  const order: Record<string, number> = { pre: 0, in: 1, post: 2 };
  for (const g of games) {
    const before = prev[g.key];
    // An answer older than one already acted on (ESPN's servers aren't always
    // in step) must not rewind the game, or its final would be sent twice.
    if (before && (order[g.state] ?? 0) < (order[before.state] ?? 0)) continue;
    const url = `${SITE}#/${g.league}/game/${g.id}`;
    let closeSent = before?.close_sent ?? false;
    let halfSent = before?.half_sent ?? false;
    // A game first seen already under way has had its start.
    let startSent = before ? before.start_sent ?? before.state !== 'pre' : g.state !== 'pre';
    const withTop = (text: string) => (g.top ? `${text} · ${g.top}` : text);
    if (before) {
      // Start: at the scheduled time, or the moment ESPN shows it live if that's sooner.
      const since = now - Date.parse(g.start);
      const due = g.state === 'in' || (g.state === 'pre' && !g.off && since >= 0);
      if (!startSent && due) {
        startSent = true;
        // Not if we're only finding out long after the fact.
        if (g.state === 'pre' ? since < 10 * 60_000 : before.state === 'pre') {
          const word = g.league === 'nfl' ? 'Kickoff' : 'Tip-off';
          const lead = g.state === 'in' ? 'Under way' : 'Starting now';
          await alert(g, 'start',
            { title: `${word}: ${match(g)}`, body: g.broadcast ? `${lead} on ${g.broadcast}` : lead, url, tag: `${g.key}:start` },
            wants(g, 'start')
          );
        }
      }
      if (g.half && !halfSent) {
        halfSent = true;
        await alert(g, 'half',
          { title: `Halftime: ${match(g)}`, body: withTop(score(g)), url, tag: `${g.key}:half` },
          wants(g, 'half'),
          'Tap to see the score'
        );
      }
      if (before.state === 'in' && g.state === 'post') {
        await alert(g, 'final', { title: `Final: ${match(g)}`, body: withTop(score(g)), url, tag: `${g.key}:final` }, wants(g, 'final'), 'Tap to see how it ended');
      }
    } else if (g.half) {
      halfSent = true; // first look mid-halftime: don't alert late
    }
    // Big performances (any game, any player): check the live box score.
    let bigSent: string[] | null = before?.big_sent ?? null;
    let bigChanged = false;
    if (anyBig && (n % 3 === 0 || (before?.state === 'in' && g.state === 'post'))) {
      const summary = summaries.get(g.key); // includes games that just ended, for the last minute's stats
      if (summary) {
        const moments = bigMoments(g.league, summary);
        const known = new Set(bigSent ?? []);
        const fresh = moments.filter((m: any) => !known.has(m.key));
        // The first look at a game only records what already happened (no late flood).
        if (bigSent) {
          for (const m of worthSending(fresh)) {
            await alert(g, 'big',
              { title: m.title, body: `${m.body} · ${match(g)} ${g.label}`, url, tag: `${g.key}:big:${m.key}` },
              (s) => s.big,
              'Tap to watch',
              `🔥 Big performance in ${match(g)}`
            );
          }
        }
        if (fresh.length || !bigSent) {
          bigSent = [...known, ...fresh.map((m: any) => m.key)];
          bigChanged = true;
        }
      }
    }
    // Follow live: one notification per game that keeps updating in place.
    if (followers[g.key] && g.state !== 'pre') {
      const card = liveCard(g.league, g, summaries.get(g.key));
      const done = g.state === 'post';
      await Promise.allSettled(followers[g.key].map(async (f) => {
        const s = subscriptions.find((x) => x.endpoint === f.endpoint);
        const waited = f.sent_at ? now - Date.parse(f.sent_at) : Infinity;
        // Play resuming after a timeout isn't worth a buzz by itself.
        const resumed = !card.stopped && f.sig?.startsWith(`${card.sig}|`);
        const fresh = f.sig !== card.sig && !resumed && (waited >= f.every * 1000 - 4000 || (card.urgent && waited >= 8_000));
        if (s && fresh) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: card.title, body: card.body, url, tag: `${g.key}:live`, quiet: true }),
              { TTL: 90, urgency: 'high' } // short-lived: a late score is worse than none (no topic: Apple rejects it)
            );
            sent++;
            if (!done) await db.from('live_follows').update({ sig: card.sig, sent_at: new Date().toISOString() }).eq('endpoint', f.endpoint).eq('game_key', g.key);
          } catch (e: any) {
            if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
            else log.push({ game_key: g.key, kind: 'live-error', title: `${e?.statusCode ?? ''} ${e?.body ?? e?.message ?? e}`.slice(0, 200), devices: 0 });
          }
        } else if (!s) log.push({ game_key: g.key, kind: 'live-error', title: 'no device for this follow', devices: 0 });
      }));
      if (done) await db.from('live_follows').delete().eq('game_key', g.key); // the final score was the last update
    }
    const heat = hot(g);
    if (heat && !closeSent) {
      closeSent = true;
      await alert(g, 'close', { title: `🔥 ${heat}: ${match(g)}`, body: `${score(g)} · ${g.label}`, url, tag: `${g.key}:close` }, (s) => s.close_games, `${g.label} · worth tuning in`);
    }
    if (!before || bigChanged || before.state !== g.state || before.close_sent !== closeSent || before.half_sent !== halfSent || (before.start_sent ?? false) !== startSent) {
      // Every column every time: a bulk upsert fills missing ones with defaults.
      updates.push({ game_key: g.key, state: g.state, close_sent: closeSent, half_sent: halfSent, start_sent: startSent, big_sent: bigSent, updated_at: new Date().toISOString() });
    }
  }
  if (updates.length) await db.from('alert_game_state').upsert(updates);
  if (log.length) await db.from('alert_log').insert(log);
  if (n === 0) {
    await db.from('alert_game_state').delete().lt('updated_at', new Date(Date.now() - 4 * 86400_000).toISOString());
    await db.from('alert_log').delete().lt('sent_at', new Date(Date.now() - 14 * 86400_000).toISOString());
    await db.from('live_follows').delete().lt('created_at', new Date(Date.now() - 3 * 86400_000).toISOString());
  }
  return { games: games.length, devices: subscriptions.length, events, sent, graded, errors: loadErrors.length ? [...loadErrors] : undefined };
  };

  // Looks never overlap: each one reads what the one before wrote.
  let line: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = line.then(fn, fn);
    line = p.catch(() => {});
    return p;
  };

  // Look now, then five more times 10 seconds apart after replying. Between
  // those, the push feed asks for an extra look the moment something happens.
  const t0 = Date.now();
  const first = await queued(() => pass(0));
  const timed = (async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const wait = t0 + n * 10_000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (Date.now() - t0 > 55_000) break; // the next minute's call takes over
      await queued(() => pass(n)).catch((e) => console.error('pass', n, e?.message ?? e));
    }
  })();
  let busy = false;
  let extra = 0;
  const pushed = listen(t0 + 56_000, (key, want) => {
    if (busy) return; // one extra look at a time; it reads every game anyway
    busy = true;
    (async () => {
      // ESPN's regular feed can trail its push feed by a moment: look again until it agrees.
      for (let i = 0; i < 4 && Date.now() - t0 < 56_000; i++) {
        if (i) await new Promise((r) => setTimeout(r, 1500));
        extra++;
        await queued(() => pass(1, true)).catch((e) => console.error('push pass', e?.message ?? e));
        const g = seen.get(key);
        if (g && g.state === want.state && (!followed.has(key) || (g.home.score === want.home && g.away.score === want.away))) break;
      }
    })().finally(() => { busy = false; });
  }).then((patches) => console.log(`push feed: ${patches} patches, ${extra} extra looks`)).catch((e) => console.error('push feed', e?.message ?? e));
  const rest = Promise.allSettled([timed, pushed]);
  // @ts-ignore EdgeRuntime exists on Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(rest);
  return Response.json(first);
});
