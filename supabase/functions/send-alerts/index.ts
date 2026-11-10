// Supabase Edge Function: called every minute (pg_cron). Each call checks ESPN
// four times, 15 seconds apart, and sends web push alerts: game starting,
// halftime, final, close games late, and big performances.
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

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth,followed,close_games,spoiler_free,scope,starts,halftime,finals,big,start_for,half_for,final_for');
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

  // One look at ESPN. `n` is which look this is within the minute (0-3).
  const pass = async (n: number) => {
  const games = await loadGames();
  const graded = n === 0 ? await gradePicks(games).catch((e) => `error: ${e?.message ?? e}`) : 0;
  if (!games.length) return { games: 0, graded, errors: [...loadErrors] };
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
  let sent = 0;
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
  // Box scores for big performances: every other look, all live games at once.
  const summaries = new Map<string, any>();
  {
    // A game that just ended is always checked, to catch the last minute's stats.
    const live = games.filter((g) =>
      g.state !== 'pre' && followers[g.key] ? true
      : anyBig && ((g.state === 'in' && n % 2 === 0) || (prev[g.key]?.state === 'in' && g.state === 'post')));
    await Promise.all(live.map(async (g) => summaries.set(g.key, await json(`${ESPN}/${PATH[g.league]}/summary?event=${g.id}`).catch(() => null))));
  }
  const now = Date.now();

  for (const g of games) {
    const before = prev[g.key];
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
    if (anyBig && (n % 2 === 0 || (before?.state === 'in' && g.state === 'post'))) {
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
        const fresh = f.sig !== card.sig && !resumed && (waited >= f.every * 1000 || (card.urgent && waited >= 12_000));
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

  // Look now, then three more times 15 seconds apart after replying, so an
  // alert is never more than a few seconds behind ESPN.
  const t0 = Date.now();
  const first = await pass(0);
  const rest = (async () => {
    for (const n of [1, 2, 3]) {
      const wait = t0 + n * 15_000 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (Date.now() - t0 > 50_000) break; // the next minute's call takes over
      await pass(n).catch((e) => console.error('pass', n, e?.message ?? e));
    }
  })();
  // @ts-ignore EdgeRuntime exists on Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(rest);
  return Response.json(first);
});
