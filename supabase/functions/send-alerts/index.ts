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

type Team = { id: string; abbr: string; score: number };
type Game = {
  key: string; league: 'nba' | 'nfl'; id: string; state: string; period: number; clock: string;
  label: string; broadcast: string; home: Team; away: Team;
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
    return { id: x?.team?.id, abbr: x?.team?.abbreviation, score: Number(x?.score) || 0 };
  };
  const st = e.status ?? c.status;
  return {
    key: `${league}:${e.id}`, league, id: e.id,
    state: st?.type?.state ?? 'pre', period: st?.period ?? 0, clock: String(st?.displayClock ?? ''),
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

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const test = new URL(req.url).searchParams.get('test'); // ?test=1 sends a test alert to every device

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth,followed,close_games,spoiler_free');
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
  if (!games.length) return Response.json({ games: 0, errors: loadErrors });
  const { data: rows } = await db.from('alert_game_state').select('game_key,state,close_sent').in('game_key', games.map((g) => g.key));
  const prev = Object.fromEntries((rows ?? []).map((r) => [r.game_key, r]));

  const followed = (g: Game) => (s: any) => (s.followed ?? []).includes(`${g.league}:${g.home.id}`) || (s.followed ?? []).includes(`${g.league}:${g.away.id}`);
  const match = (g: Game) => `${g.away.abbr} at ${g.home.abbr}`;
  const score = (g: Game) => `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr}`;
  const updates: any[] = [];
  let events = 0;
  let sent = 0;

  for (const g of games) {
    const before = prev[g.key];
    const url = `${SITE}#/${g.league}/game/${g.id}`;
    let closeSent = before?.close_sent ?? false;
    if (before) {
      if (before.state === 'pre' && g.state === 'in') {
        events++;
        sent += await send({ title: `${g.league === 'nfl' ? 'Kickoff' : 'Tip-off'}: ${match(g)}`, body: g.broadcast ? `On ${g.broadcast}` : 'Game is live', url, tag: `${g.key}:start` }, followed(g));
      }
      if (before.state === 'in' && g.state === 'post') {
        events++;
        sent += await send({ title: `Final: ${match(g)}`, body: score(g), url, tag: `${g.key}:final` }, followed(g), 'Tap to see how it ended');
      }
    }
    const heat = hot(g);
    if (heat && !closeSent) {
      events++;
      closeSent = true;
      sent += await send({ title: `🔥 ${heat}: ${match(g)}`, body: `${score(g)} · ${g.label}`, url, tag: `${g.key}:close` }, (s) => s.close_games, `${g.label} · worth tuning in`);
    }
    if (!before || before.state !== g.state || before.close_sent !== closeSent) {
      updates.push({ game_key: g.key, state: g.state, close_sent: closeSent, updated_at: new Date().toISOString() });
    }
  }
  if (updates.length) await db.from('alert_game_state').upsert(updates);
  await db.from('alert_game_state').delete().lt('updated_at', new Date(Date.now() - 4 * 86400_000).toISOString());
  return Response.json({ games: games.length, devices: subscriptions.length, events, sent });
});
