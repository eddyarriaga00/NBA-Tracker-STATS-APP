// Supabase Edge Function: runs every minute (pg_cron), checks ESPN, and sends
// web push alerts for followed teams (start + final) and close games late.
// Each alert goes out once per game, tracked in alert_game_state.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

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
  return {
    key: `${league}:${e.id}`, league, id: String(e.id),
    state: st?.type?.state ?? 'pre', completed: st?.type?.completed === true, start: c.date ?? e.date,
    half: st?.type?.name === 'STATUS_HALFTIME' || /^halftime$/i.test(st?.type?.shortDetail ?? ''),
    period: st?.period ?? 0, clock: String(st?.displayClock ?? ''),
    label: st?.type?.shortDetail ?? '',
    broadcast: c.broadcast || (c.broadcasts ?? []).flatMap((b: any) => b.names ?? []).join(', ') || '',
    home: side('home'), away: side('away'),
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
  for (const u of hosts) {
    const r = await fetch(u + bust, { headers: HEADERS });
    if (r.ok) return r.json();
    last = `${r.status} ${u}`;
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

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth,followed,close_games,spoiler_free,scope,starts,halftime,finals');
  const subscriptions = subs ?? [];

  const send = async (payload: Record<string, string>, pick: (s: any) => boolean, spoilerBody?: string) => {
    let sent = 0;
    await Promise.allSettled(
      subscriptions.filter(pick).map(async (s) => {
        const body = s.spoiler_free && spoilerBody != null ? spoilerBody : payload.body;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...payload, body }), { TTL: 600, urgency: 'high' });
          sent++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // device unsubscribed
        }
      })
    );
    return sent;
  };

  if (test) {
    const sent = await send({ title: 'NBA Tracker alerts are on', body: 'You’ll get alerts even when the app is closed.', url: SITE, tag: 'test' }, () => true);
    return Response.json({ test: true, devices: subscriptions.length, sent });
  }

  const games = await loadGames();
  const graded = await gradePicks(games).catch((e) => `error: ${e?.message ?? e}`);
  if (!games.length) return Response.json({ games: 0, graded, errors: loadErrors });
  const { data: rows } = await db.from('alert_game_state').select('game_key,state,close_sent,half_sent').in('game_key', games.map((g) => g.key));
  const prev = Object.fromEntries((rows ?? []).map((r) => [r.game_key, r]));

  // Which devices want this game: all games, or only games with a followed team.
  const wants = (g: Game) => (s: any) =>
    s.scope === 'all' || (s.followed ?? []).includes(`${g.league}:${g.home.id}`) || (s.followed ?? []).includes(`${g.league}:${g.away.id}`);
  const match = (g: Game) => `${g.away.abbr} at ${g.home.abbr}`;
  const score = (g: Game) => `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr}`;
  const updates: any[] = [];
  let events = 0;
  let sent = 0;

  for (const g of games) {
    const before = prev[g.key];
    const url = `${SITE}#/${g.league}/game/${g.id}`;
    let closeSent = before?.close_sent ?? false;
    let halfSent = before?.half_sent ?? false;
    if (before) {
      if (before.state === 'pre' && g.state === 'in') {
        events++;
        sent += await send(
          { title: `${g.league === 'nfl' ? 'Kickoff' : 'Tip-off'}: ${match(g)}`, body: g.broadcast ? `Starting now on ${g.broadcast}` : 'Starting now', url, tag: `${g.key}:start` },
          (s) => s.starts && wants(g)(s)
        );
      }
      if (g.half && !halfSent) {
        events++;
        halfSent = true;
        sent += await send(
          { title: `Halftime: ${match(g)}`, body: score(g), url, tag: `${g.key}:half` },
          (s) => s.halftime && wants(g)(s),
          'Tap to see the score'
        );
      }
      if (before.state === 'in' && g.state === 'post') {
        events++;
        sent += await send({ title: `Final: ${match(g)}`, body: score(g), url, tag: `${g.key}:final` }, (s) => s.finals && wants(g)(s), 'Tap to see how it ended');
      }
    } else if (g.half) {
      halfSent = true; // first look mid-halftime: don't alert late
    }
    const heat = hot(g);
    if (heat && !closeSent) {
      events++;
      closeSent = true;
      sent += await send({ title: `🔥 ${heat}: ${match(g)}`, body: `${score(g)} · ${g.label}`, url, tag: `${g.key}:close` }, (s) => s.close_games, `${g.label} · worth tuning in`);
    }
    if (!before || before.state !== g.state || before.close_sent !== closeSent || before.half_sent !== halfSent) {
      updates.push({ game_key: g.key, state: g.state, close_sent: closeSent, half_sent: halfSent, updated_at: new Date().toISOString() });
    }
  }
  if (updates.length) await db.from('alert_game_state').upsert(updates);
  await db.from('alert_game_state').delete().lt('updated_at', new Date(Date.now() - 4 * 86400_000).toISOString());
  return Response.json({ games: games.length, devices: subscriptions.length, events, sent, graded });
});
