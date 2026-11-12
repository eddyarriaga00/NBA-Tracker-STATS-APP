import { lastPlay, stoppage } from '../../supabase/functions/send-alerts/stoppage.js';
import { buildQuarterStats } from '../lib/quarterStats';
import { buildNflQuarterStats } from '../lib/nflQuarterStats';
// Data layer for ESPN's public NBA and NFL feeds (no API key, CORS-enabled).
// Every function returns plain, normalized objects so components never
// touch the raw ESPN shapes.

export const LEAGUES = {
  nba: { id: 'nba', name: 'NBA', path: 'basketball/nba', periods: 4, playoffSpots: 6, playInSpots: 10 },
  nfl: { id: 'nfl', name: 'NFL', path: 'football/nfl', periods: 4, playoffSpots: 7 },
};

const site = (lg) => `https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[lg].path}`;
const standingsUrl = (lg) => `https://site.api.espn.com/apis/v2/sports/${LEAGUES[lg].path}/standings`;
const leadersUrl = (lg) => `https://site.api.espn.com/apis/site/v3/sports/${LEAGUES[lg].path}/leaders`;

const cache = new Map();

// ---------- Seasons ----------
// ESPN names NBA seasons by the year they end (2026-27 = 2027) and NFL seasons
// by the year they start (2026 season = 2026).
export function currentSeason(lg, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan
  if (lg === 'nba') return m >= 9 ? y + 1 : y; // new season from October
  return m >= 7 ? y : y - 1; // NFL: new season from August
}
export const seasonLabel = (lg, yr) => (lg === 'nba' ? `${yr - 1}-${String(yr).slice(2)}` : String(yr));
/** This season plus the previous `back` seasons, newest first. */
// Oldest season with complete, correct data in ESPN's records, per feature
// (checked against known history: best records, scoring leaders, champions).
// NBA years are the year a season ends (1986 = 1985-86).
//   standings/leaders: NBA from 1985-86, NFL leaders from 1985, standings from 1993
//   team schedules and playoff results: NBA from 1993-94 (earlier ones are
//   missing games or shifted a year), NFL from 1993; NFL weekly scores from 1999.
export const FIRST_SEASON = {
  nba: { standings: 1986, leaders: 1986, awards: 1994, team: 1994, bracket: 1994, scores: 1994 },
  nfl: { standings: 1993, leaders: 1985, awards: 1993, team: 1993, bracket: 1993, scores: 1999 },
};
export const firstSeason = (lg, feature = 'team') => FIRST_SEASON[lg][feature] ?? FIRST_SEASON[lg].team;

/** Link to a team's page; for a past season, the page opens on that season. */
export function teamHref(lg, id, season) {
  const past = season && Number(season) !== currentSeason(lg) && Number(season) >= firstSeason(lg, 'team');
  return `/${lg}/team/${id}${past ? `?season=${season}` : ''}`;
}

/** Every supported season for a feature, newest first. */
export function seasonOptions(lg, feature = 'team') {
  const cur = currentSeason(lg);
  const n = Math.max(1, cur - firstSeason(lg, feature) + 1);
  return Array.from({ length: n }, (_, i) => ({ value: cur - i, label: seasonLabel(lg, cur - i) }));
}

const inflight = new Map();

// ESPN's history service often answers old seasons with a few 503s before it
// warms up, so those requests pass `patient` to retry longer.
async function get(url, { ttl = 15_000, fresh = false, patient = false } = {}) {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.data;
  // Share one request when several parts of the page ask for the same URL.
  const key = `${fresh ? 'F' : 'C'}${url}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchWithRetry(url, fresh, hit, patient).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function fetchWithRetry(url, fresh, hit, patient = false) {
  let lastErr;
  // Retry transient failures with a short backoff (longer for old seasons).
  const tries = patient ? 5 : 3;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // a stuck request must not stall live updates
    try {
      // Live refreshes skip the browser cache so every poll gets ESPN's latest.
      const res = await fetch(url, { cache: fresh ? 'no-store' : 'default', signal: ctrl.signal });
      if (res.status >= 400 && res.status < 500) {
        // Not found / bad request won't fix itself, so don't retry.
        const err = new Error("We couldn't find that. The link may be wrong or out of date.");
        err.notFound = true;
        throw err;
      }
      if (!res.ok) throw new Error(`ESPN is having trouble right now (${res.status}).`);
      const data = await res.json();
      cache.set(url, { at: Date.now(), data });
      return data;
    } catch (e) {
      lastErr =
        e.name === 'AbortError'
          ? new Error('ESPN is slow to respond. Retrying…')
          : e.message === 'Failed to fetch'
            ? new Error("Can't reach the server. Check your connection.")
            : e;
      if (e.notFound) break;
      if (attempt < tries - 1) await new Promise((r) => setTimeout(r, (patient ? 1500 : 400) * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  // On first load, stale data beats nothing. During live refreshes, report the
  // failure instead so the page keeps its last data and shows it's out of date.
  if (hit && !fresh) return hit.data;
  throw lastErr;
}

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export const fromKey = (k) => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));

export const logoUrl = (lg, abbr, dark = false) =>
  abbr ? `https://a.espncdn.com/i/teamlogos/${lg}/500${dark ? '-dark' : ''}/${abbr.toLowerCase()}.png` : '';

// The 1990s Houston Oilers share "HOU" with today's Texans (a different
// franchise). Tag it invisibly so the Texans logo isn't shown for them.
export const NO_LOGO = '\u200b';
const teamAbbr = (t) => (t?.abbreviation === 'HOU' && /oilers/i.test(t?.displayName ?? t?.name ?? '') ? `HOU${NO_LOGO}` : t?.abbreviation);

const headshotOf = (a) => (typeof a?.headshot === 'string' ? a.headshot : a?.headshot?.href);
const hex = (c, fallback = '#888888') => (c ? `#${c}` : fallback);

function normStatus(status, date, timeValid = true) {
  const t = status?.type ?? {};
  const state = t.state ?? 'pre'; // pre | in | post
  let label = t.shortDetail ?? '';
  if (state === 'pre' && t.name === 'STATUS_SCHEDULED' && date && timeValid !== false) {
    label = new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (state === 'post') label = t.shortDetail?.startsWith('Final') ? t.shortDetail : 'Final';
  return {
    state,
    label,
    period: status?.period ?? 0,
    clock: status?.displayClock ?? '',
    postponed: ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED'].includes(t.name),
    half: t.name === 'STATUS_HALFTIME' || /^halftime$/i.test(t.shortDetail ?? ''),
  };
}

function totalRecord(c) {
  const list = c.records ?? c.record ?? [];
  const r = list.find((x) => x.type === 'total') ?? list[0];
  return r?.summary ?? r?.displayValue ?? '';
}

function normCompetitor(c) {
  const t = c?.team ?? {};
  const tbd = !t.id || Number(t.id) < 0 || t.abbreviation === 'TBD';
  return {
    tbd,
    id: t.id,
    abbr: teamAbbr(t),
    name: t.shortDisplayName ?? t.name,
    location: t.location,
    full: t.displayName,
    color: hex(t.color),
    alt: t.alternateColor ? hex(t.alternateColor) : null,
    score: c?.score != null && c.score !== '' ? Number(c.score?.value ?? c.score) : null,
    winner: !!c?.winner,
    record: totalRecord(c ?? {}),
    homeAway: c?.homeAway,
    linescores: (c?.linescores ?? []).map((l) => l.displayValue ?? String(l.value ?? '')),
  };
}

function cardLeaders(lg, comp, away, home) {
  if (lg === 'nba') {
    return [away, home]
      .map((c) => {
        const l = (c?.leaders ?? []).find((x) => x.name === 'points')?.leaders?.[0];
        return l && { primary: `${l.displayValue} PTS`, secondary: l.athlete?.shortName };
      })
      .filter(Boolean);
  }
  return ['passingYards', 'rushingYards']
    .map((k) => {
      const l = (comp.leaders ?? []).find((x) => x.name === k)?.leaders?.[0];
      return l && { primary: l.athlete?.shortName, secondary: l.displayValue };
    })
    .filter(Boolean);
}

function normSituation(s) {
  if (!s) return null;
  const drive = s.lastPlay?.drive;
  return {
    downDistance: s.shortDownDistanceText ?? '',
    full: s.downDistanceText ?? '',
    possession: s.possession ?? null,
    redZone: !!s.isRedZone,
    lastPlay: s.lastPlay?.text?.trim() ?? '',
    stoppage: stoppage(s.lastPlay), // timeout, injury, review or break, if play is stopped
    // Field position, for the live field graphic.
    spot: s.possessionText ?? '', // e.g. "TB 20" or "50"
    yardLine: typeof s.yardLine === 'number' ? s.yardLine : null, // yards from the offense's own goal
    down: s.down ?? null,
    distance: s.distance ?? null,
    goalToGo: /goal/i.test(s.downDistanceText ?? ''),
    driveStart: drive?.start?.text ?? '',
    driveStartYardLine: typeof drive?.start?.yardLine === 'number' ? drive.start.yardLine : null,
    driveSummary: drive?.description ?? '',
    homeTimeouts: s.homeTimeouts ?? null,
    awayTimeouts: s.awayTimeouts ?? null,
  };
}

function normGame(lg, e) {
  const comp = e.competitions?.[0] ?? {};
  const comps = comp.competitors ?? [];
  const home = comps.find((c) => c.homeAway === 'home') ?? comps[0];
  const away = comps.find((c) => c.homeAway === 'away') ?? comps[1];
  const broadcast = comp.broadcast || comp.broadcasts?.flatMap((b) => b.names ?? []).join(', ') || '';
  return {
    id: e.id,
    league: lg,
    date: e.date,
    status: normStatus(e.status ?? comp.status, e.date, e.timeValid),
    timeValid: e.timeValid !== false,
    home: normCompetitor(home),
    away: normCompetitor(away),
    leaders: cardLeaders(lg, comp, away, home),
    situation: normSituation(comp.situation),
    venue: comp.venue?.fullName ?? '',
    broadcast,
    note: comp.notes?.[0]?.headline ?? '',
  };
}

const sortGames = (games) => {
  const order = { in: 0, pre: 1, post: 2 };
  return games.sort(
    (a, b) => order[a.status.state] - order[b.status.state] || new Date(a.date) - new Date(b.date)
  );
};

/** NBA: games on a calendar day (YYYYMMDD). */
// ---------- live speed ----------
// ESPN refreshes each feed about every 10 seconds, and its two hosts (and the
// scoreboard vs. the game feed) refresh at different moments. Live refreshes
// read two of them and keep whichever is further along, which cuts the wait
// for a new score roughly in half.

/** How far along a game is, as a comparable number list: state, period, clock, points. */
function progress(status, competitors) {
  const st = status?.type?.state;
  const total = (competitors ?? []).reduce((n, c) => n + (Number(typeof c.score === 'object' ? c.score?.value : c.score) || 0), 0);
  // "5:08" or "27.1" left in the period; the two feeds don't both carry a numeric clock.
  const c = String(status?.displayClock ?? '');
  const left = c.includes(':') ? c.split(':').reduce((m, x) => m * 60 + (Number(x) || 0), 0) : c ? Number(c) || 0 : 1e9;
  return [st === 'post' ? 2 : st === 'in' ? 1 : 0, status?.period ?? 0, -left, total];
}
const ahead = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};
const eventProgress = (e) => progress(e.status ?? e.competitions?.[0]?.status, e.competitions?.[0]?.competitors);

/** A scoreboard; on live refreshes, the freshest of ESPN's two hosts game by game. */
async function getScoreboard(url, opts) {
  if (!opts?.fresh) return get(url, opts);
  const [a, b] = await Promise.allSettled([get(url, opts), get(url.replace('site.api.espn.com', 'site.web.api.espn.com'), opts)]);
  if (a.status !== 'fulfilled') {
    if (b.status === 'fulfilled') return b.value;
    throw a.reason;
  }
  if (b.status !== 'fulfilled') return a.value;
  const other = new Map((b.value.events ?? []).map((e) => [e.id, e]));
  return { ...a.value, events: (a.value.events ?? []).map((e) => (other.has(e.id) && ahead(eventProgress(other.get(e.id)), eventProgress(e)) ? other.get(e.id) : e)) };
}

const gameDay = new Map(); // game id -> its scoreboard day, learned on first load

export async function getNbaScoreboard(dateKey, opts) {
  const data = await getScoreboard(`${site('nba')}/scoreboard?dates=${dateKey}`, opts);
  return sortGames((data.events ?? []).map((e) => normGame('nba', e)));
}

/**
 * NFL: games in a week. With no week given, ESPN returns the current week.
 * Returns the games plus the season calendar so the UI can build a week picker.
 */
export async function getNflScoreboard(sel, opts) {
  const q = sel ? `?seasontype=${sel.type}&week=${sel.week}&dates=${sel.year}` : '';
  const data = await getScoreboard(`${site('nfl')}/scoreboard${q}`, opts);
  const calendar = (data.leagues?.[0]?.calendar ?? [])
    .filter((c) => c.entries?.length && c.value !== '4')
    .map((c) => ({
      type: c.value,
      label: c.label,
      weeks: c.entries.map((w) => ({
        week: w.value,
        label: w.label,
        short: w.alternateLabel?.replace('Week ', 'Wk ') ?? w.label,
        detail: w.detail,
        start: w.startDate,
        end: w.endDate,
      })),
    }));
  // Games are not sorted by state for NFL; the UI groups them by day instead.
  const games = (data.events ?? []).map((e) => normGame('nfl', e)).sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    games,
    year: data.season?.year,
    type: String(data.season?.type ?? sel?.type ?? 2),
    week: String(data.week?.number ?? sel?.week ?? 1),
    byes: (data.week?.teamsOnBye ?? []).map((t) => t.abbreviation),
    calendar,
  };
}

// ---------- Game detail ----------

const parseStat = (v, kind) => {
  if (v == null) return 0;
  const s = String(v);
  if (kind === 'ratio') {
    const [a, b] = s.split(/[-/]/).map(Number);
    return b ? a / b : 0;
  }
  if (kind === 'time') {
    const [m, sec] = s.split(':').map(Number);
    return (m || 0) * 60 + (sec || 0);
  }
  if (kind === 'first') return parseFloat(s.split('-')[0]) || 0;
  return parseFloat(s.replace(/,/g, '')) || 0;
};

// [espn label, display label, higherIsBetter, parse kind]
const TEAM_STAT_ROWS = {
  nba: [
    ['Field Goal %', 'FG%', true],
    ['Three Point %', '3P%', true],
    ['Free Throw %', 'FT%', true],
    ['Rebounds', 'Rebounds', true],
    ['Offensive Rebounds', 'Off. Rebounds', true],
    ['Assists', 'Assists', true],
    ['Steals', 'Steals', true],
    ['Blocks', 'Blocks', true],
    ['Total Turnovers', 'Turnovers', false],
    ['Points in Paint', 'Points in Paint', true],
    ['Fast Break Points', 'Fast Break Pts', true],
    ['Largest Lead', 'Largest Lead', true],
  ],
  nfl: [
    ['Total Yards', 'Total Yards', true],
    ['Passing', 'Passing Yards', true],
    ['Rushing', 'Rushing Yards', true],
    ['1st Downs', 'First Downs', true],
    ['3rd down efficiency', '3rd Down', true, 'ratio'],
    ['4th down efficiency', '4th Down', true, 'ratio'],
    ['Red Zone (Made-Att)', 'Red Zone', true, 'ratio'],
    ['Yards per Play', 'Yards / Play', true],
    ['Turnovers', 'Turnovers', false],
    ['Sacks-Yards Lost', 'Sacks Allowed', false, 'first'],
    ['Penalties', 'Penalties', false, 'first'],
    ['Possession', 'Possession', true, 'time'],
  ],
};

const NFL_BOX_ORDER = [
  ['passing', 'Passing'],
  ['rushing', 'Rushing'],
  ['receiving', 'Receiving'],
  ['defensive', 'Defense'],
  ['interceptions', 'Interceptions'],
  ['fumbles', 'Fumbles'],
  ['kicking', 'Kicking'],
  ['punting', 'Punting'],
  ['kickReturns', 'Kick Returns'],
  ['puntReturns', 'Punt Returns'],
];

const normAthlete = (a) => ({
  id: a.athlete?.id,
  name: a.athlete?.displayName,
  short: a.athlete?.shortName ?? a.athlete?.displayName,
  headshot: headshotOf(a.athlete),
  pos: a.athlete?.position?.abbreviation ?? '',
  jersey: a.athlete?.jersey ?? '',
  starter: !!a.starter,
  dnp: !!a.didNotPlay || !a.stats?.length,
  reason: a.reason ?? '',
  stats: a.stats ?? [],
});

const fallbackHeadshot = (lg, a) => ({ ...a, headshot: a.headshot || (a.id ? `https://a.espncdn.com/i/headshots/${lg}/players/full/${a.id}.png` : '') });

function normBox(lg, s) {
  const norm = (a) => fallbackHeadshot(lg, normAthlete(a));
  return (s.boxscore?.players ?? []).map((p) => {
    if (lg === 'nba') {
      const st = p.statistics?.[0] ?? {};
      return {
        teamId: p.team?.id,
        labels: st.labels ?? [],
        totals: st.totals ?? [],
        athletes: (st.athletes ?? []).map(norm),
      };
    }
    const byName = Object.fromEntries((p.statistics ?? []).map((x) => [x.name, x]));
    return {
      teamId: p.team?.id,
      groups: NFL_BOX_ORDER.filter(([k]) => byName[k]?.athletes?.length).map(([k, title]) => ({
        key: k,
        title,
        labels: byName[k].labels ?? [],
        totals: byName[k].totals ?? [],
        athletes: byName[k].athletes.map(norm),
      })),
    };
  });
}

function normDrive(d) {
  const plays = (d.plays ?? []).map((p) => ({
    id: p.id,
    text: p.text?.trim(),
    period: p.period?.number ?? 0,
    clock: p.clock?.displayValue ?? '',
    away: p.awayScore,
    home: p.homeScore,
    scoring: !!p.scoringPlay,
    down: p.start?.shortDownDistanceText ?? '',
  }));
  const last = plays[plays.length - 1];
  return {
    id: d.id,
    teamId: d.team?.id,
    abbr: d.team?.abbreviation,
    result: d.displayResult ?? d.result ?? '',
    short: d.shortDisplayResult ?? '',
    description: d.description ?? '',
    isScore: !!d.isScore,
    period: d.start?.period?.number ?? plays[0]?.period ?? 0,
    clock: d.start?.clock?.displayValue ?? '',
    start: d.start?.text ?? '',
    away: last?.away,
    home: last?.home,
    plays,
  };
}

/** NFL player stats for each quarter, built from ESPN's detailed play feed. */
export async function getNflQuarters(id, opts) {
  const url = (page) => `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${id}/competitions/${id}/plays?limit=400&page=${page}`;
  const first = await get(url(1), opts);
  const items = [...(first.items ?? [])];
  for (let page = 2; page <= Math.min(first.pageCount ?? 1, 3); page++) items.push(...((await get(url(page), opts)).items ?? []));
  const q = buildNflQuarterStats(items);
  // Old games list plays without naming the players, so there is nothing to build from.
  return { ...q, named: items.some((it) => it.participants?.length) };
}

/** The best player of a game so far, by the same rating as Top Players. */
function starOf(lg, s) {
  try {
    const best = (lg === 'nba' ? nbaRatings(s) : nflRatings(s)).sort((a, b) => b.rating - a.rating)[0];
    if (!best?.athlete?.id || !(best.rating > 0)) return null;
    return {
      id: best.athlete.id,
      name: best.athlete.displayName,
      headshot: headshotOf(best.athlete) || `https://a.espncdn.com/i/headshots/${lg}/players/full/${best.athlete.id}.png`,
      pos: best.athlete.position?.abbreviation ?? '',
      teamId: String(best.team?.id ?? ''),
      line: best.line,
      rating: Math.round(best.rating * 10) / 10,
    };
  } catch {
    return null; // never let this break the rest of the game page
  }
}

export async function getGame(lg, id, opts) {
  // Live refreshes also read the scoreboard: it often has the new score first.
  const day = opts?.fresh ? gameDay.get(`${lg}:${id}`) : null;
  const [s, board] = await Promise.all([
    get(`${site(lg)}/summary?event=${id}`, opts),
    day ? get(`${site(lg)}/scoreboard?dates=${day}`, opts).catch(() => null) : null,
  ]);
  const comp = s.header?.competitions?.[0] ?? {};
  if (comp.date) gameDay.set(`${lg}:${id}`, new Date(comp.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replaceAll('-', ''));
  const live = board?.events?.find((e) => e.id === String(id));
  const liveComp = live?.competitions?.[0];
  if (liveComp && ahead(eventProgress(live), progress(comp.status, comp.competitors))) {
    comp.status = live.status ?? liveComp.status;
    for (const c of comp.competitors ?? []) {
      const x = liveComp.competitors?.find((y) => y.id === c.id);
      if (x) { c.score = x.score; if (x.winner != null) c.winner = x.winner; }
    }
    if (liveComp.situation) comp.situation = liveComp.situation;
  }
  const comps = (comp.competitors ?? []).map(normCompetitor);
  const home = comps.find((c) => c.homeAway === 'home') ?? comps[0];
  const away = comps.find((c) => c.homeAway === 'away') ?? comps[1];

  const teamStatsById = Object.fromEntries(
    (s.boxscore?.teams ?? []).map((t) => [
      t.team?.id,
      Object.fromEntries((t.statistics ?? []).map((x) => [x.label, x.displayValue])),
    ])
  );
  const teamStats = TEAM_STAT_ROWS[lg]
    .map(([key, label, higherIsBetter, kind]) => {
      const a = teamStatsById[away?.id]?.[key];
      const h = teamStatsById[home?.id]?.[key];
      return { label, higherIsBetter, away: a, home: h, av: parseStat(a, kind), hv: parseStat(h, kind) };
    })
    .filter((r) => r.away != null && r.home != null);

  const leaders = (s.leaders ?? []).map((l) => ({
    teamId: l.team?.id,
    cats: Object.fromEntries(
      (l.leaders ?? []).map((c) => {
        const x = c.leaders?.[0];
        return [
          c.name,
          x && {
            id: x.athlete?.id,
            name: x.athlete?.shortName ?? x.athlete?.displayName,
            headshot: headshotOf(x.athlete),
            value: x.displayValue,
          },
        ];
      })
    ),
  }));

  const plays = (s.plays ?? []).map((p) => ({
    id: p.id,
    text: p.text,
    period: p.period?.number ?? 0,
    clock: p.clock?.displayValue ?? '',
    away: p.awayScore,
    home: p.homeScore,
    scoring: !!p.scoringPlay,
    teamId: p.team?.id,
  }));

  const drives = [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])]
    .filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i)
    .map(normDrive);

  const scoringPlays = (s.scoringPlays ?? []).map((p) => ({
    id: p.id,
    text: p.text,
    type: p.type?.text ?? '',
    period: p.period?.number ?? 0,
    clock: p.clock?.displayValue ?? '',
    away: p.awayScore,
    home: p.homeScore,
    teamId: p.team?.id,
    abbr: p.team?.abbreviation,
  }));

  // The game feed has no live down-and-distance; the scoreboard for that day does.
  let situation = normSituation(comp.situation);
  if (lg === 'nfl' && comp.status?.type?.state === 'in' && !situation && comp.date) {
    try {
      const day = new Date(comp.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replaceAll('-', '');
      const sb = await get(`${site(lg)}/scoreboard?dates=${day}`, opts);
      situation = normSituation(sb.events?.find((e) => e.id === String(id))?.competitions?.[0]?.situation);
    } catch { /* situation is optional */ }
  }

  // NBA only: per-quarter player stats built from the play-by-play.
  let quarters = null;
  if (lg === 'nba' && s.plays?.length && s.boxscore?.players?.length) {
    try {
      quarters = buildQuarterStats(
        s.plays,
        s.boxscore.players.map((p) => ({
          teamId: p.team?.id,
          athletes: (p.statistics?.[0]?.athletes ?? []).map((a) => ({ id: a.athlete?.id, starter: !!a.starter })),
        }))
      );
    } catch {
      quarters = null; // never let this break the rest of the game page
    }
  }

  const info = s.gameInfo ?? {};
  return {
    id,
    league: lg,
    quarters,
    star: starOf(lg, s),
    preview: normPreview(lg, s, away, home),
    round: await playoffRound(lg, s, id, home?.id).catch(() => ''),
    seasonYear: s.header?.season?.year ?? null, // so team links from an old game open that season

    // NBA shot locations (feet; x across the court 0-50, y out from the hoop).
    shots:
      lg === 'nba'
        ? (s.plays ?? [])
            .filter((p) => p.shootingPlay && !/free throw/i.test(p.type?.text ?? '') && p.coordinate)
            .map((p) => ({
              id: p.id,
              x: Number(p.coordinate.x),
              y: Number(p.coordinate.y),
              made: !!p.scoringPlay,
              three: p.pointsAttempted === 3 || /three point/i.test(p.text ?? ''),
              teamId: p.team?.id,
              playerId: p.participants?.[0]?.athlete?.id,
              period: p.period?.number ?? 0,
              clock: p.clock?.displayValue ?? '',
              text: p.text ?? '',
            }))
            .filter((sh) => sh.x >= -2 && sh.x <= 52 && sh.y >= -6 && sh.y <= 94)
        : [],
    videos: (s.videos ?? [])
      .map((v) => ({
        id: String(v.id ?? v.links?.web?.href ?? ''),
        title: v.headline ?? '',
        duration: v.duration ?? 0,
        thumb: v.thumbnail ?? '',
        src: v.links?.source?.HD?.href ?? v.links?.source?.full?.href ?? v.links?.source?.href ?? '',
        web: v.links?.web?.href ?? '',
      }))
      .filter((v) => v.src || v.web),
    winProb: normWinProb(lg, s),
    date: comp.date,
    status: normStatus(comp.status, comp.date, comp.timeValid ?? s.header?.timeValid),
    timeValid: (comp.timeValid ?? s.header?.timeValid) !== false,
    home,
    away,
    box: normBox(lg, s),
    teamStats,
    leaders,
    plays,
    drives,
    currentDriveId: s.drives?.current?.id ?? null,
    scoringPlays,
    situation,
    // Play stopped right now? The game feed's latest play says why.
    stoppage: comp.status?.type?.state === 'in' ? stoppage(lastPlay(s)) ?? situation?.stoppage ?? null : null,
    venue: info.venue?.fullName ?? '',
    city: [info.venue?.address?.city, info.venue?.address?.state].filter(Boolean).join(', '),
    attendance: info.attendance,
    weather: info.weather ? `${info.weather.temperature ?? ''}° ${info.weather.displayValue ?? ''}`.trim() : '',
    broadcast: (comp.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean).join(', '),
  };
}

// ---------- Preview (odds, predictor, injuries, form, series) ----------

/** Just the pre-game preview (injuries, recent form). Shares the game page's request. */
export async function getPregame(lg, id, opts) {
  const s = await get(`${site(lg)}/summary?event=${id}`, { ttl: 10 * 60_000, ...opts });
  return normPreview(lg, s) ?? {};
}

function normPreview(lg, s, away, home) {
  const pc = (s.pickcenter ?? [])[0];
  const odds = pc
    ? {
        provider: pc.provider?.name ?? '',
        details: pc.details ?? '',
        overUnder: pc.overUnder,
        awayML: pc.awayTeamOdds?.moneyLine,
        homeML: pc.homeTeamOdds?.moneyLine,
      }
    : null;

  const pr = s.predictor;
  const pct = (x) => (x == null || x === '' ? null : Number(x));
  let predictor = null;
  if (pr) {
    const h = pct(pr.homeTeam?.gameProjection);
    const a = pct(pr.awayTeam?.gameProjection);
    if (h != null || a != null) predictor = { home: h ?? 100 - a, away: a ?? 100 - h };
  }

  const injuries = (s.injuries ?? [])
    .map((t) => ({
      teamId: t.team?.id,
      abbr: t.team?.abbreviation,
      list: (t.injuries ?? []).map((i) => ({
        id: i.athlete?.id,
        name: i.athlete?.displayName,
        pos: i.athlete?.position?.abbreviation ?? '',
        headshot: headshotOf(i.athlete),
        status: i.status ?? i.type?.description ?? '',
        detail: [i.details?.type, i.details?.location === 'Body' ? '' : i.details?.detail].filter(Boolean).join(' · '),
        returnDate: i.details?.returnDate ?? '',
      })),
    }))
    .filter((t) => t.list.length);

  const lastFive = (s.lastFiveGames ?? []).map((t) => ({
    teamId: t.team?.id,
    abbr: t.team?.abbreviation,
    games: (t.events ?? []).map((e) => ({
      id: e.id,
      date: e.gameDate,
      result: e.gameResult,
      score: e.score,
      atVs: e.atVs,
      opp: e.opponent?.abbreviation,
    })),
  }));

  const ss = (s.seasonseries ?? [])[0];
  const series = ss
    ? {
        title: ss.title ?? 'Season Series',
        summary: ss.summary ?? '',
        events: (ss.events ?? []).map((e) => {
          const comps = e.competitors ?? [];
          const h = comps.find((c) => c.homeAway === 'home');
          const a = comps.find((c) => c.homeAway === 'away');
          return {
            id: e.id,
            date: e.date,
            state: e.statusType?.state ?? 'pre',
            away: a ? { abbr: a.team?.abbreviation, score: a.score, winner: a.winner } : null,
            home: h ? { abbr: h.team?.abbreviation, score: h.score, winner: h.winner } : null,
          };
        }),
      }
    : null;

  if (!odds && !predictor && !injuries.length && !lastFive.length && !series) return null;
  return { odds, predictor, injuries, lastFive, series };
}

// ---------- Win probability ----------

function normWinProb(lg, s) {
  const wp = s.winprobability ?? [];
  if (wp.length < 2) return null;
  const regLen = lg === 'nfl' ? 900 : 720;
  const otLen = lg === 'nfl' ? 600 : 300;
  const clockSec = (c) => {
    const v = String(c ?? '');
    if (v.includes(':')) {
      const [m, x] = v.split(':').map(Number);
      return (m || 0) * 60 + (x || 0);
    }
    return Number(v) || 0;
  };
  const elapsed = (period, clock) => {
    const len = period <= 4 ? regLen : otLen;
    const before = Math.min(period - 1, 4) * regLen + Math.max(0, period - 5) * otLen;
    return before + Math.max(0, len - clockSec(clock));
  };

  const plays = {};
  for (const p of s.plays ?? []) plays[p.id] = p;
  for (const d of [...(s.drives?.previous ?? []), ...(s.drives?.current ? [s.drives.current] : [])]) {
    for (const p of d.plays ?? []) plays[p.id] = p;
  }

  const points = [];
  let maxPeriod = 4;
  for (const w of wp) {
    const p = plays[w.playId];
    if (!p || !p.period?.number) continue;
    maxPeriod = Math.max(maxPeriod, p.period.number);
    points.push({
      t: elapsed(p.period.number, p.clock?.displayValue),
      home: Math.round((w.homeWinPercentage ?? 0.5) * 1000) / 10,
      period: p.period.number,
      clock: p.clock?.displayValue ?? '',
      text: p.text ?? '',
      away: p.awayScore,
      homeScore: p.homeScore,
    });
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a.t - b.t);
  const total = 4 * regLen + Math.max(0, maxPeriod - 4) * otLen;
  return { points, total, regLen, otLen, periods: maxPeriod };
}

// ---------- Standings ----------

function normEntry(e) {
  const stat = {};
  for (const x of e.stats ?? []) {
    stat[x.name] = x.displayValue ?? x.summary;
    if (x.type) stat[`t:${x.type}`] = x.summary ?? x.displayValue;
  }
  return {
    id: e.team?.id,
    abbr: teamAbbr(e.team),
    name: e.team?.shortDisplayName ?? e.team?.name,
    color: hex(e.team?.color),
    seed: Number(stat.playoffSeed) || 99,
    wins: stat.wins ?? '0',
    losses: stat.losses ?? '0',
    ties: stat.ties ?? '0',
    pct: stat.winPercent,
    gb: stat.gamesBehind,
    streak: stat.streak ?? '',
    l10: stat['t:lasttengames'] ?? '',
    home: stat['t:home'] ?? '',
    road: stat['t:road'] ?? '',
    div: stat['t:vsdiv'] ?? stat.divisionRecord ?? '',
    pf: stat.pointsFor,
    pa: stat.pointsAgainst,
    diff: stat.differential ?? stat.pointDifferential,
    clinch: stat.clincher ?? '',
  };
}

export async function getStandings(lg, season, opts) {
  const q = new URLSearchParams();
  if (lg === 'nfl') q.set('level', '3');
  if (season && season !== currentSeason(lg)) q.set('season', String(season));
  const url = `${standingsUrl(lg)}${q.toString() ? `?${q}` : ''}`;
  const s = await get(url, { ttl: 60_000, ...opts });
  return (s.children ?? []).map((conf) => {
    const divisions = (conf.children ?? []).map((d) => ({
      name: d.name,
      short: d.name?.replace(/^(AFC|NFC)\s+/, ''),
      teams: (d.standings?.entries ?? []).map(normEntry),
    }));
    divisions.forEach((d) => d.teams.sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct) || a.seed - b.seed));
    const teams = divisions.length
      ? divisions.flatMap((d) => d.teams.map((t) => ({ ...t, division: d.short })))
      : (conf.standings?.entries ?? []).map(normEntry);
    return {
      name: conf.name,
      short: conf.abbreviation ?? conf.name,
      divisions,
      teams: [...teams].sort((a, b) => a.seed - b.seed),
    };
  });
}

// ---------- League leaders ----------

export const LEADER_CATS = {
  nba: [
    { key: 'pointsPerGame', short: 'PTS', label: 'Points', unit: 'PTS per game' },
    { key: 'reboundsPerGame', short: 'REB', label: 'Rebounds', unit: 'REB per game' },
    { key: 'assistsPerGame', short: 'AST', label: 'Assists', unit: 'AST per game' },
    { key: 'stealsPerGame', short: 'STL', label: 'Steals', unit: 'STL per game' },
    { key: 'blocksPerGame', short: 'BLK', label: 'Blocks', unit: 'BLK per game' },
    { key: '3PointsMadePerGame', short: '3PM', label: '3-Pointers Made', unit: '3PM per game' },
    { key: 'fieldGoalPercentage', short: 'FG%', label: 'Field Goal %', unit: 'Field goal %' },
    { key: '3PointPct', short: '3P%', label: '3-Point %', unit: '3-point %' },
    { key: 'FreeThrowPct', short: 'FT%', label: 'Free Throw %', unit: 'Free throw %' },
    { key: 'doubleDouble', short: 'DD', label: 'Double-Doubles', unit: 'Double-doubles' },
  ],
  nfl: [
    { key: 'passingYards', short: 'Pass Yds', label: 'Passing Yards', unit: 'Passing yards' },
    { key: 'passingTouchdowns', short: 'Pass TD', label: 'Passing TDs', unit: 'Passing touchdowns' },
    { key: 'quarterbackRating', short: 'QB Rtg', label: 'Passer Rating', unit: 'Passer rating' },
    { key: 'rushingYards', short: 'Rush Yds', label: 'Rushing Yards', unit: 'Rushing yards' },
    { key: 'rushingTouchdowns', short: 'Rush TD', label: 'Rushing TDs', unit: 'Rushing touchdowns' },
    { key: 'receivingYards', short: 'Rec Yds', label: 'Receiving Yards', unit: 'Receiving yards' },
    { key: 'receptions', short: 'Rec', label: 'Receptions', unit: 'Receptions' },
    { key: 'receivingTouchdowns', short: 'Rec TD', label: 'Receiving TDs', unit: 'Receiving touchdowns' },
    { key: 'sacks', short: 'Sacks', label: 'Sacks', unit: 'Sacks' },
    { key: 'totalTackles', short: 'Tackles', label: 'Tackles', unit: 'Total tackles' },
    { key: 'interceptions', short: 'INT', label: 'Interceptions', unit: 'Interceptions' },
    { key: 'totalTouchdowns', short: 'TD', label: 'Total Touchdowns', unit: 'Total touchdowns' },
  ],
};

// Past seasons come from the player rankings feed: NBA's leaders feed only
// covers the current season, and NFL's returns *playoff* leaders for past years.
// The rankings feed applies official minimums for rate stats (FG%, etc.).
const PAST_SORT = {
  nba: {
    pointsPerGame: 'offensive.avgPoints',
    reboundsPerGame: 'general.avgRebounds',
    assistsPerGame: 'offensive.avgAssists',
    stealsPerGame: 'defensive.avgSteals',
    blocksPerGame: 'defensive.avgBlocks',
    '3PointsMadePerGame': 'offensive.avgThreePointFieldGoalsMade',
    fieldGoalPercentage: 'offensive.fieldGoalPct',
    '3PointPct': 'offensive.threePointFieldGoalPct',
    FreeThrowPct: 'offensive.freeThrowPct',
    doubleDouble: 'general.doubleDouble',
  },
  nfl: {
    passingYards: 'passing.passingYards',
    passingTouchdowns: 'passing.passingTouchdowns',
    // Passer rating isn't qualified by ESPN; NFL minimum is 14 attempts per team game.
    quarterbackRating: { sort: 'passing.QBRating', min: ['passing.passingAttempts', 224] },
    rushingYards: 'rushing.rushingYards',
    rushingTouchdowns: 'rushing.rushingTouchdowns',
    receivingYards: 'receiving.receivingYards',
    receptions: 'receiving.receptions',
    receivingTouchdowns: 'receiving.receivingTouchdowns',
    sacks: 'defensive.sacks',
    totalTackles: 'defensive.totalTackles',
    interceptions: 'defensiveInterceptions.interceptions',
    totalTouchdowns: 'scoring.totalTouchdowns',
  },
};

async function getPastLeaders(lg, season, opts) {
  const base = `https://site.web.api.espn.com/apis/common/v3/sports/${LEAGUES[lg].path}/statistics/byathlete`;
  // Ask the backup source at the same time so a failing rankings feed doesn't add a wait.
  const coreP = get(`${CORE(lg)}/seasons/${season}/types/2/leaders?limit=10`, { ttl: 6 * 60 * 60_000, patient: true, ...opts }).catch(() => null);
  const entries = await Promise.all(
    Object.entries(PAST_SORT[lg]).map(async ([key, spec]) => {
      const { sort, min } = typeof spec === 'string' ? { sort: spec } : spec;
      if (lg === 'nfl' && key === 'quarterbackRating') {
        const rated = await pastPasserRating(base, season, opts).catch(() => []);
        if (rated.length) return [key, rated];
      }
      try {
        const d = await get(`${base}?season=${season}&seasontype=2&limit=${min ? 60 : 10}&sort=${sort}:desc`, { ttl: 60 * 60_000, ...opts });
        // Category names differ in case between the sort key and the response.
        const field = (path) => {
          const [catName, statName] = path.split('.');
          const ci = (d.categories ?? []).findIndex((c) => c.name.toLowerCase() === catName.toLowerCase());
          const si = d.categories?.[ci]?.names?.indexOf(statName) ?? -1;
          return (x) => {
            const cat = (x.categories ?? []).find((c) => c.name.toLowerCase() === catName.toLowerCase()) ?? x.categories?.[ci];
            return cat?.totals?.[si] ?? '';
          };
        };
        const value = field(sort);
        const minVal = min ? field(min[0]) : null;
        const list = (d.athletes ?? [])
          .filter((x) => !minVal || (parseFloat(String(minVal(x)).replace(/,/g, '')) || 0) >= min[1])
          .slice(0, 10)
          .map((x) => {
            const a = x.athlete ?? {};
            return {
              id: a.id,
              name: a.displayName,
              first: a.firstName,
              last: a.lastName,
              headshot: headshotOf(a),
              pos: a.position?.abbreviation,
              jersey: a.jersey,
              value: value(x),
              // This feed gives a player's latest team, not that season's, so it's left out.
              team: { id: '', abbr: '', name: '', color: '#8e8e93' },
            };
          });
        return [key, list];
      } catch {
        return [key, []];
      }
    })
  );
  const categories = Object.fromEntries(entries);
  // ESPN's season leaders record lists each player with the team he played for
  // that season (the rankings feed uses his last team), so it goes first; the
  // rankings feed fills anything it doesn't have.
  // (Its NFL passer rating isn't a real passer rating, so that one stays with the rankings feed.)
  const fromCore = Object.keys(categories).filter((k) => !(lg === 'nfl' && k === 'quarterbackRating'));
  const core = await getCoreLeaders(lg, await coreP, fromCore, opts).catch(() => ({}));
  for (const k of fromCore) if (core[k]?.length) categories[k] = core[k];
  return { season: `${seasonLabel(lg, season)} Regular Season`, categories };
}

/**
 * NFL passer rating, worked out from each passer's numbers with the official
 * formula (ESPN's own rating field is wrong for past seasons). Qualifying
 * passers need 14 attempts per team game.
 */
async function pastPasserRating(base, season, opts) {
  const d = await get(`${base}?season=${season}&seasontype=2&limit=60&sort=passing.passingAttempts:desc`, { ttl: 60 * 60_000, ...opts });
  const names = (d.categories ?? []).find((c) => c.name === 'passing')?.names ?? [];
  const at = (x, n) => parseFloat(String((x.categories ?? []).find((c) => c.name === 'passing')?.totals?.[names.indexOf(n)] ?? '').replace(/,/g, '')) || 0;
  const games = season >= 2021 ? 17 : season === 1987 ? 15 : season === 1982 ? 9 : 16;
  const clamp = (v) => Math.max(0, Math.min(2.375, v));
  return (d.athletes ?? [])
    .map((x) => {
      const att = at(x, 'passingAttempts');
      const a = clamp((at(x, 'completions') / att - 0.3) * 5);
      const b = clamp((at(x, 'passingYards') / att - 3) * 0.25);
      const c = clamp((at(x, 'passingTouchdowns') / att) * 20);
      const e = clamp(2.375 - (at(x, 'interceptions') / att) * 25);
      return { x, att, rating: att ? ((a + b + c + e) / 6) * 100 : 0 };
    })
    .filter((p) => p.att >= 14 * games)
    .sort((p, q) => q.rating - p.rating)
    .slice(0, 10)
    .map(({ x, rating }) => {
      const a = x.athlete ?? {};
      return {
        id: a.id,
        name: a.displayName,
        first: a.firstName,
        last: a.lastName,
        headshot: headshotOf(a),
        pos: a.position?.abbreviation,
        jersey: a.jersey,
        value: rating.toFixed(1),
        team: { id: '', abbr: '', name: '', color: '#8e8e93' },
      };
    });
}

/** Season leaders from ESPN's core API (names looked up per player). */
async function getCoreLeaders(lg, d, keys, opts) {
  if (!d) return {};
  const o = { ttl: 6 * 60 * 60_000, patient: true, ...opts };
  const cats = (d.categories ?? []).filter((c) => keys.includes(c.name));
  const refs = [...new Set(cats.flatMap((c) => (c.leaders ?? []).map((l) => secure(l.athlete?.$ref)).filter(Boolean)))];
  // Teams as they were that season (SEA, not OKC, for the 1990s Sonics).
  const teamRefs = lg === 'nba' ? [...new Set(cats.flatMap((c) => (c.leaders ?? []).map((l) => secure(l.team?.$ref)).filter(Boolean)))] : [];
  const [people, teams, abbrNow] = await Promise.all([pool(refs, 10, (u) => get(u, o)), pool(teamRefs, 10, (u) => get(u, o)), teamAbbrMap(lg)]);
  const byRef = Object.fromEntries(refs.map((u, i) => [u, people[i]]));
  const abbr = { ...abbrNow };
  teams.forEach((t) => t?.id && t.abbreviation && (abbr[String(t.id)] = t.abbreviation));
  return Object.fromEntries(
    cats.map((c) => [
      c.name,
      (c.leaders ?? []).slice(0, 10).map((l) => {
        const a = byRef[secure(l.athlete?.$ref)] ?? {};
        const tid = refId(l.team?.$ref, 'teams');
        return {
          id: a.id ?? refId(l.athlete?.$ref, 'athletes'),
          name: a.displayName ?? '',
          first: a.firstName,
          last: a.lastName,
          headshot: headshotOf(a),
          pos: a.position?.abbreviation,
          jersey: a.jersey,
          value: l.displayValue,
          // NBA records keep the team from that season; NFL ones point at the player's latest team, so leave it out.
          team: lg === 'nba' ? { id: tid, abbr: abbr[tid] ?? '', name: abbr[tid] ?? '', color: '#8e8e93' } : { id: '', abbr: '', name: '', color: '#8e8e93' },
        };
      }).filter((x) => x.name),
    ])
  );
}

export async function getLeaders(lg, season, opts) {
  const past = season && season !== currentSeason(lg);
  if (past) return getPastLeaders(lg, season, opts);
  const d = await get(`${leadersUrl(lg)}${past ? `?season=${season}` : ''}`, { ttl: 5 * 60_000, ...opts });
  const cats = d.leaders?.categories ?? [];
  return {
    season: (past ? d.requestedSeason?.displayName : d.currentSeason?.displayName) ?? '',
    categories: Object.fromEntries(
      cats.map((c) => [
        c.name,
        (c.leaders ?? []).map((l) => ({
          id: l.athlete?.id,
          name: l.athlete?.displayName,
          first: l.athlete?.firstName,
          last: l.athlete?.lastName,
          headshot: headshotOf(l.athlete),
          pos: l.athlete?.position?.abbreviation,
          jersey: l.athlete?.jersey,
          value: l.displayValue,
          team: {
            id: l.team?.id,
            abbr: l.team?.abbreviation,
            name: l.team?.shortDisplayName,
            color: hex(l.team?.color),
          },
        })),
      ])
    ),
  };
}


// ---------- Players ----------

const web = (lg) => `https://site.web.api.espn.com/apis/common/v3/sports/${LEAGUES[lg].path}`;

export async function getPlayer(lg, id, opts) {
  const o = { ttl: 60_000, ...opts };
  const [bioR, ovR, logR, careerR] = await Promise.allSettled([
    get(`${web(lg)}/athletes/${id}`, o),
    get(`${web(lg)}/athletes/${id}/overview`, o),
    get(`${web(lg)}/athletes/${id}/gamelog`, o),
    get(`${web(lg)}/athletes/${id}/stats`, o),
  ]);
  if (bioR.status !== 'fulfilled') throw bioR.reason;
  const a = bioR.value.athlete ?? {};
  const ov = ovR.status === 'fulfilled' ? ovR.value : {};
  const log = logR.status === 'fulfilled' ? logR.value : null;
  const career = careerR.status === 'fulfilled' ? careerR.value : null;

  const bio = {
    id: a.id,
    name: a.displayName,
    first: a.firstName,
    last: a.lastName,
    headshot: headshotOf(a),
    jersey: a.jersey ?? '',
    position: a.position?.displayName ?? '',
    posAbbr: a.position?.abbreviation ?? '',
    team: a.team
      ? { id: a.team.id, abbr: a.team.abbreviation, name: a.team.displayName, color: hex(a.team.color) }
      : null,
    active: a.active !== false,
    status: a.status?.name ?? '',
    injury: a.injuries?.[0] ? `${a.injuries[0].status ?? ''}${a.injuries[0].details?.type ? ` · ${a.injuries[0].details.type}` : ''}` : '',
    facts: [
      ['Age', a.age],
      ['Height', a.displayHeight],
      ['Weight', a.displayWeight],
      ['Born', a.displayDOB],
      ['Birthplace', a.displayBirthPlace],
      ['College', a.college?.name],
      ['Draft', a.displayDraft],
      ['Experience', a.displayExperience],
    ].filter(([, v]) => v != null && v !== ''),
    summaryTitle: a.statsSummary?.displayName ?? '',
    summary: (a.statsSummary?.statistics ?? []).map((x) => ({
      label: x.shortDisplayName ?? x.abbreviation,
      name: x.displayName,
      stat: x.name,
      value: x.displayValue,
      rank: x.rankDisplayValue ?? '',
    })),
  };

  const splits = ov.statistics
    ? {
        labels: ov.statistics.labels ?? [],
        names: ov.statistics.displayNames ?? [],
        rows: (ov.statistics.splits ?? []).map((r) => ({ label: r.displayName, stats: r.stats ?? [] })),
      }
    : null;

  const gamelog = normGamelog(log);

  let careerStats = null;
  if (career?.categories?.length) {
    const teams = {};
    for (const t of Object.values(career.teams ?? {})) teams[t.id] = t.abbreviation;
    careerStats = career.categories
      .filter((c) => c.statistics?.length)
      .map((c) => ({
        key: c.name,
        title: c.displayName ?? c.name,
        labels: (c.labels ?? []).map((l) => l.trim()),
        totals: c.totals ?? [],
        rows: c.statistics.map((r) => ({
          season: r.season?.displayName ?? '',
          year: r.season?.year,
          teamId: r.teamId,
          team: teams[r.teamId] ?? '',
          stats: r.stats ?? [],
        })),
      }));
  }

  const news = (ov.news ?? []).slice(0, 6).map((n) => ({
    id: n.id,
    headline: n.headline,
    description: n.description,
    url: n.links?.web?.href,
    image: n.images?.[0]?.url,
    published: n.published,
  }));

  const awards = (ov.awards ?? []).map((x) => ({
    id: x.id,
    name: x.name,
    count: x.displayCount ?? '',
    seasons: (x.seasons ?? []).map(Number).filter(Boolean),
  }));

  return { league: lg, bio, splits, gamelog, career: careerStats, news, awards };
}

// ---------- Teams ----------

export async function getTeam(lg, id, season, opts) {
  const o = { ttl: 60_000, ...opts };
  const cur = currentSeason(lg);
  const yr = season || cur;
  const sq = yr !== cur ? `season=${yr}&` : '';
  // ESPN's roster feed is always today's roster, so past seasons use that
  // season's player stats (everyone who played for the team that year).
  const past = yr !== cur;
  const [rosterR, schedR, postR] = await Promise.allSettled([
    past
      ? get(`https://site.web.api.espn.com/apis/site/v2/sports/${LEAGUES[lg].path}/teams/${id}/athletes/statistics?season=${yr}`, { ...o, ttl: 6 * 60 * 60_000, patient: true })
      : get(`${site(lg)}/teams/${id}/roster`, o),
    get(`${site(lg)}/teams/${id}/schedule${sq ? `?${sq.slice(0, -1)}` : ''}`, o),
    get(`${site(lg)}/teams/${id}/schedule?${sq}seasontype=3`, o),
  ]);
  if (rosterR.status !== 'fulfilled' && schedR.status !== 'fulfilled') throw rosterR.reason;
  const r = rosterR.status === 'fulfilled' ? rosterR.value : {};
  const sch = schedR.status === 'fulfilled' ? schedR.value : {};
  const post = postR.status === 'fulfilled' ? postR.value : {};
  const allEvents = [...(sch.events ?? []), ...(post.events ?? [])].filter(
    (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i
  );
  const t = r.team ?? sch.team ?? {};
  if (!t.displayName && !t.abbreviation) {
    const err = new Error("We couldn't find that team. The link may be wrong or out of date.");
    err.notFound = true;
    throw err;
  }

  const toPlayer = (a) => ({
    id: a.id,
    name: a.displayName ?? a.fullName,
    headshot: headshotOf(a),
    jersey: a.jersey ?? '',
    pos: a.position?.abbreviation ?? '',
    age: a.age,
    height: a.displayHeight ?? '',
    weight: a.displayWeight ?? '',
    college: a.college?.name ?? a.college?.shortName ?? '',
    exp: a.experience?.years,
    injury: a.injuries?.[0]?.status ?? '',
  });
  const raw = r.athletes ?? [];
  const groups = past
    ? pastRoster(lg, r)
    : raw.length && raw[0]?.items
    ? raw.map((g) => ({
        title:
          {
            offense: 'Offense',
            defense: 'Defense',
            specialTeam: 'Special Teams',
            injuredReserveOrOut: 'Injured Reserve / Out',
            suspended: 'Suspended',
            practiceSquad: 'Practice Squad',
          }[g.position] ?? String(g.position ?? 'Other').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
        players: (g.items ?? []).map(toPlayer),
      }))
    : [{ title: 'Roster', players: raw.map(toPlayer) }];

  const schedule = allEvents.map((e) => {
    const c = e.competitions?.[0] ?? {};
    const me = (c.competitors ?? []).find((x) => x.team?.id === String(id)) ?? {};
    const opp = (c.competitors ?? []).find((x) => x.team?.id !== String(id)) ?? {};
    const score = (x) => x.score?.displayValue ?? (typeof x.score === 'string' ? x.score : null);
    return {
      id: e.id,
      date: e.date,
      state: c.status?.type?.state ?? 'pre',
      label: c.status?.type?.shortDetail ?? '',
      home: me.homeAway === 'home',
      opp: { id: opp.team?.id, abbr: teamAbbr(opp.team), name: opp.team?.shortDisplayName ?? opp.team?.displayName },
      us: score(me),
      them: score(opp),
      win: me.winner,
      week: e.week?.text ?? '',
      seasonType: e.seasonType?.abbreviation ?? '',
      playoff: e.seasonType?.type === 3 || e.seasonType?.abbreviation === 'post' || e.seasonType?.type === 5,
      playIn: e.seasonType?.type === 5,
      note: c.notes?.[0]?.headline ?? '',
      weekNum: e.week?.number,
      broadcast: c.broadcasts?.[0]?.media?.shortName ?? '',
    };
  });

  schedule.sort((a, b) => new Date(a.date) - new Date(b.date));
  labelPlayoffGames(lg, schedule);
  return {
    league: lg,
    id: t.id ?? id,
    abbr: teamAbbr(t),
    name: t.displayName,
    short: t.shortDisplayName ?? t.name,
    color: hex(t.color),
    record: yr === cur ? t.recordSummary ?? '' : '',
    standing: yr === cur ? t.standingSummary ?? '' : '',
    coach: r.coach?.[0] ? `${r.coach[0].firstName} ${r.coach[0].lastName}` : '',
    season: sch.requestedSeason?.displayName ?? seasonLabel(lg, yr),
    isCurrent: yr === cur,
    pastRoster: past,
    groups,
    schedule,
  };
}

/** "Finals · Game 7" for a playoff game page ('' otherwise). */
async function playoffRound(lg, s, id, teamId) {
  const type = s.header?.season?.type;
  if (type !== 3 && type !== 5) return '';
  if (type === 5) return 'Play-In';
  const yr = s.header?.season?.year;
  const d = await get(`${site(lg)}/teams/${teamId}/schedule?season=${yr}&seasontype=3`, { ttl: 60 * 60_000 });
  const games = (d.events ?? [])
    .map((e) => {
      const c = e.competitions?.[0] ?? {};
      const opp = (c.competitors ?? []).find((x) => x.team?.id !== String(teamId)) ?? {};
      return { id: e.id, date: e.date, opp: { id: opp.team?.id }, note: c.notes?.[0]?.headline ?? '', playoff: true, playIn: false, weekNum: e.week?.number };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  labelPlayoffGames(lg, games);
  return games.find((g) => g.id === String(id))?.round ?? '';
}

/**
 * "Finals · Game 7" style labels for a team's playoff games. Uses ESPN's note
 * when it has one; old seasons have none, so the round comes from the order of
 * opponents (each new opponent is the next round) and the game number from the
 * games against that opponent.
 */
function labelPlayoffGames(lg, schedule) {
  const po = schedule.filter((e) => e.playoff);
  if (lg === 'nba') {
    const series = [];
    for (const e of po.filter((x) => !x.playIn)) {
      const last = series[series.length - 1];
      if (last && last.opp === e.opp.id) last.games.push(e);
      else series.push({ opp: e.opp.id, games: [e] });
    }
    const ROUNDS = ['First Round', 'Conf. Semis', 'Conf. Finals', 'Finals'];
    series.forEach((sr, i) =>
      sr.games.forEach((e, g) => {
        const n = e.note.match(/game\s*(\d+)/i)?.[1] ?? g + 1;
        const x = e.note.toLowerCase();
        const round = /nba finals|^finals/.test(x) ? 'Finals' : /conference finals|\bfinals\b/.test(x) ? 'Conf. Finals' : /semifinal/.test(x) ? 'Conf. Semis' : /1st round|first round/.test(x) ? 'First Round' : ROUNDS[i] ?? 'Playoffs';
        e.round = `${round} · Game ${n}`;
      })
    );
    for (const e of po.filter((x) => x.playIn)) e.round = 'Play-In';
    return;
  }
  const BY_WEEK = { 1: 'Wild Card', 2: 'Divisional', 3: 'Conf. Championship', 4: 'Super Bowl', 5: 'Super Bowl' };
  po.forEach((e, i) => {
    const x = e.note.toLowerCase();
    e.round = /super bowl/.test(x)
      ? e.note.replace(/^.*?(super bowl.*)$/i, '$1').replace(/^super bowl/i, 'Super Bowl')
      : /championship/.test(x) ? 'Conf. Championship'
      : /divisional|second round/.test(x) ? 'Divisional'
      : /wild ?card|first round/.test(x) ? 'Wild Card'
      : BY_WEEK[e.weekNum] ?? (i === po.length - 1 && new Date(e.date).getMonth() === 1 ? 'Super Bowl' : 'Playoffs');
  });
}

/** A past season's roster from its player stats, with each player's main number. */
function pastRoster(lg, d) {
  const cats = d.results ?? [];
  const seen = new Set();
  const player = (l, label) => {
    const a = l.athlete ?? {};
    if (!a.id || seen.has(a.id)) return null;
    seen.add(a.id);
    return { id: a.id, name: a.displayName, headshot: headshotOf(a), jersey: '', pos: a.position?.abbreviation ?? '', line: `${l.displayValue} ${label}` };
  };
  if (lg === 'nba') {
    const c = cats[0];
    const players = (c?.leaders ?? []).map((l) => player(l, 'PPG')).filter(Boolean);
    return players.length ? [{ title: 'Roster', players }] : [];
  }
  const label = { passing: 'pass yds', rushing: 'rush yds', receiving: 'rec yds', defensive: 'tackles', kicking: 'FG', punting: 'punt yds', returning: 'ret yds', scoring: 'pts' };
  const sections = [
    ['Offense', ['passing', 'rushing', 'receiving']],
    ['Defense', ['defensive']],
    ['Special Teams', ['kicking', 'punting', 'returning']],
  ];
  return sections
    .map(([title, names]) => ({
      title,
      players: names.flatMap((n) => (cats.find((c) => c.name === n)?.leaders ?? []).map((l) => player(l, label[n]))).filter(Boolean),
    }))
    .filter((g) => g.players.length);
}

/** All teams in a league, grouped by division, from the standings feed. */
export async function getTeams(lg, opts) {
  const url = `${standingsUrl(lg)}?level=3`;
  const s = await get(url, { ttl: 10 * 60_000, ...opts });
  return (s.children ?? []).map((conf) => ({
    name: conf.name,
    short: conf.abbreviation ?? conf.name,
    divisions: (conf.children ?? []).map((d) => ({
      name: d.name,
      teams: (d.standings?.entries ?? [])
        .map((e) => ({
          id: e.team?.id,
          abbr: e.team?.abbreviation,
          name: e.team?.displayName,
          short: e.team?.shortDisplayName,
          color: hex(e.team?.color),
          record: (() => {
            const st = e.stats ?? [];
            const total = st.find((x) => x.type === 'total')?.summary;
            if (total) return total;
            const w = st.find((x) => x.name === 'wins')?.displayValue;
            const l = st.find((x) => x.name === 'losses')?.displayValue;
            return w != null && l != null ? `${w}-${l}` : '';
          })(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
  }));
}

// ---------- Search ----------

const LEAGUE_UID = { 'l:46': 'nba', 'l:28': 'nfl' };

export async function searchPlayers(query, opts) {
  const q = query.trim();
  if (q.length < 2) return [];
  const d = await get(`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=40`, {
    ttl: 5 * 60_000,
    ...opts,
  });
  const out = [];
  for (const r of d.results ?? []) {
    if (r.type !== 'player') continue;
    for (const c of r.contents ?? []) {
      const uid = c.uid ?? '';
      const lgKey = Object.keys(LEAGUE_UID).find((k) => uid.includes(`~${k}~`));
      const id = uid.match(/~a:(\d+)/)?.[1];
      if (!lgKey || !id) continue;
      out.push({
        league: LEAGUE_UID[lgKey],
        id,
        name: c.displayName,
        team: c.subtitle ?? '',
        headshot: c.image?.default ?? '',
      });
    }
  }
  return out;
}


// ---------- Team season stats ----------

const TEAM_STATS = {
  nba: [
    ['Scoring', [['offensive', 'avgPoints', 'Points / Game'], ['offensive', 'fieldGoalPct', 'Field Goal %'], ['offensive', 'threePointFieldGoalPct', '3-Point %'], ['offensive', 'freeThrowPct', 'Free Throw %'], ['offensive', 'twoPointFieldGoalPct', '2-Point %'], ['offensive', 'avgThreePointFieldGoalsMade', '3PM / Game'], ['offensive', 'avgFreeThrowsAttempted', 'FTA / Game']]],
    ['Playmaking', [['offensive', 'avgAssists', 'Assists / Game'], ['offensive', 'avgTurnovers', 'Turnovers / Game'], ['general', 'assistTurnoverRatio', 'Assist / Turnover']]],
    ['Rebounding & Defense', [['general', 'avgRebounds', 'Rebounds / Game'], ['offensive', 'avgOffensiveRebounds', 'Off. Rebounds / Game'], ['defensive', 'avgDefensiveRebounds', 'Def. Rebounds / Game'], ['defensive', 'avgSteals', 'Steals / Game'], ['defensive', 'avgBlocks', 'Blocks / Game'], ['general', 'avgFouls', 'Fouls / Game']]],
  ],
  nfl: [
    ['Offense', [['passing', 'totalPointsPerGame', 'Points / Game'], ['passing', 'yardsPerGame', 'Yards / Game'], ['passing', 'passingYardsPerGame', 'Pass Yards / Game'], ['rushing', 'rushingYardsPerGame', 'Rush Yards / Game'], ['passing', 'completionPct', 'Completion %'], ['passing', 'yardsPerPassAttempt', 'Yards / Pass'], ['rushing', 'yardsPerRushAttempt', 'Yards / Rush'], ['passing', 'passingTouchdowns', 'Pass TDs'], ['rushing', 'rushingTouchdowns', 'Rush TDs'], ['passing', 'QBRating', 'Passer Rating'], ['passing', 'sacks', 'Sacks Allowed']]],
    ['Efficiency', [['miscellaneous', 'thirdDownConvPct', '3rd Down %'], ['miscellaneous', 'fourthDownConvPct', '4th Down %'], ['miscellaneous', 'redzoneTouchdownPct', 'Red Zone TD %'], ['miscellaneous', 'turnOverDifferential', 'Turnover Diff.'], ['miscellaneous', 'totalTakeaways', 'Takeaways'], ['miscellaneous', 'totalGiveaways', 'Giveaways'], ['miscellaneous', 'totalPenalties', 'Penalties']]],
    ['Defense', [['defensive', 'sacks', 'Sacks'], ['defensive', 'totalTackles', 'Tackles'], ['defensive', 'tacklesForLoss', 'Tackles for Loss'], ['defensive', 'passesDefended', 'Passes Defended'], ['defensiveInterceptions', 'interceptions', 'Interceptions'], ['general', 'fumblesRecovered', 'Fumbles Recovered']]],
    ['Special Teams', [['kicking', 'fieldGoalPct', 'Field Goal %'], ['kicking', 'longFieldGoalMade', 'Longest FG'], ['kicking', 'extraPointPct', 'Extra Point %'], ['punting', 'grossAvgPuntYards', 'Punt Average'], ['returning', 'yardsPerKickReturn', 'Kick Return Avg.']]],
  ],
};

export async function getTeamStats(lg, id, season, opts) {
  const past = season && season !== currentSeason(lg);
  const d = await get(`${site(lg)}/teams/${id}/statistics${past ? `?season=${season}` : ''}`, { ttl: 10 * 60_000, patient: past, ...opts });
  const cats = d.results?.stats?.categories ?? [];
  const find = (cat, name) => cats.find((c) => c.name === cat)?.stats?.find((x) => x.name === name);
  const sections = TEAM_STATS[lg]
    .map(([title, rows]) => ({
      title,
      rows: rows
        .map(([cat, name, label]) => {
          const x = find(cat, name);
          return x && { label, value: x.displayValue, rank: x.rankDisplayValue ?? '' };
        })
        .filter(Boolean),
    }))
    .filter((sec) => sec.rows.length);
  const gp = find('general', 'gamesPlayed')?.displayValue ?? find('passing', 'teamGamesPlayed')?.displayValue;
  return { season: d.requestedSeason?.displayName ?? seasonLabel(lg, season || currentSeason(lg)), gamesPlayed: gp, sections };
}

// ---------- Player game log by season ----------

function normGamelog(log) {
  if (!log?.events) return null;
  const rows = [];
  for (const st of log.seasonTypes ?? []) {
    if (/preseason/i.test(st.displayName ?? '')) continue; // exhibition games skew averages
    const playoff = /postseason|play ?in/i.test(st.displayName ?? '');
    for (const cat of st.categories ?? []) {
      for (const e of cat.events ?? []) {
        const meta = log.events[e.eventId];
        if (!meta) continue;
        rows.push({
          playoff,
          id: e.eventId,
          date: meta.gameDate,
          atVs: meta.atVs,
          opp: meta.opponent?.abbreviation,
          result: meta.gameResult,
          score: meta.score,
          season: st.displayName,
          stats: e.stats ?? [],
        });
      }
    }
  }
  rows.sort((x, y) => new Date(y.date) - new Date(x.date));
  const seasons = (log.filters ?? []).find((f) => f.name === 'season')?.options?.map((o) => Number(o.value)).filter(Boolean) ?? [];
  return { labels: log.labels ?? [], names: log.displayNames ?? [], rows, seasons };
}

export async function getGamelog(lg, id, season, opts) {
  const d = await get(`${web(lg)}/athletes/${id}/gamelog${season ? `?season=${season}` : ''}`, { ttl: 5 * 60_000, ...opts });
  return normGamelog(d);
}

/**
 * Every game of a player's career, from one game log per season. Seasons that
 * fail to load are skipped and counted in `missed`.
 */
export async function getCareerGames(lg, id, seasons, opts) {
  const cur = currentSeason(lg);
  const list = [...new Set(seasons)].filter((y) => y <= cur).sort((a, b) => b - a);
  const logs = new Array(list.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      const y = list[i];
      try {
        const d = await get(`${web(lg)}/athletes/${id}/gamelog?season=${y}`, { ttl: y === cur ? 5 * 60_000 : 24 * 60 * 60_000, patient: y < cur - 1, ...opts });
        logs[i] = normGamelog(d);
      } catch {
        logs[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const ref = logs.find((l) => l?.rows.length);
  if (!ref) return { labels: [], names: [], rows: [], missed: logs.filter((l) => !l).length };
  const key = ref.labels.join('|');
  const rows = logs.filter((l) => l && l.labels.join('|') === key).flatMap((l) => l.rows);
  return { labels: ref.labels, names: ref.names, rows, missed: logs.filter((l) => !l).length };
}

// ---------- Awards & contracts (ESPN core API) ----------

const CORE = (lg) => `https://sports.core.api.espn.com/v2/sports/${LEAGUES[lg].path.replace('/', '/leagues/')}`;
// The core API hands out http:// links; secure pages can only load https://.
const secure = (ref) => String(ref ?? '').replace(/^http:\/\//, 'https://');
const refId = (ref, kind) => String(ref ?? '').match(new RegExp(`/${kind}/(\\d+)`))?.[1];

/** Run async jobs with limited concurrency (be gentle on phones and on ESPN). */
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try { out[k] = await fn(items[k], k); } catch { out[k] = null; }
      }
    })
  );
  return out;
}

// Coach of the Year winners for seasons where ESPN's award record has no name.
// (ESPN's per-season coach lookup returns today's coach, so it can't be used.)
const COACH_OF_YEAR = {
  nfl: { 2017: 'Sean McVay', 2019: 'John Harbaugh', 2020: 'Kevin Stefanski', 2022: 'Brian Daboll', 2023: 'Kevin Stefanski' },
};

// Display order for award cards; anything else follows.
const AWARD_ORDER = {
  nba: ['33', '43', '39', '35', '40', '36', '297', '53', '377', '218', '217', '77', '44', '45', '46', '49', '50', '47', '48', '378'],
  nfl: ['477', '317', '478', '479', '480', '481', '483', '482', '484'],
};

async function teamAbbrMap(lg) {
  try {
    const confs = await getTeams(lg);
    return Object.fromEntries(confs.flatMap((c) => c.divisions.flatMap((d) => d.teams.map((t) => [t.id, t.abbr]))));
  } catch {
    return {};
  }
}

/** Awards for a season; returns null when that season has none yet. */
export async function getAwards(lg, season, opts) {
  const o = { ttl: 6 * 60 * 60_000, patient: true, ...opts };
  const list = await get(`${CORE(lg)}/seasons/${season}/awards?limit=50`, o);
  const refs = (list.items ?? []).map((x) => secure(x.$ref));
  if (!refs.length) return null;
  const [awards, abbr] = await Promise.all([pool(refs, 8, (u) => get(u, o)), teamAbbrMap(lg)]);

  const winnersToFetch = [];
  for (const a of awards) for (const w of a?.winners ?? []) if (w.athlete?.$ref) winnersToFetch.push(secure(w.athlete.$ref));
  const people = {};
  await pool([...new Set(winnersToFetch)], 10, async (u) => {
    people[u] = await get(u, o);
  });

  const order = AWARD_ORDER[lg];
  const rank = (id) => (order.indexOf(String(id)) + 1 || 999);
  return awards
    .filter(Boolean)
    .map((a) => ({
      id: String(a.id),
      name: a.name,
      description: a.description ?? '',
      team: (a.winners ?? []).length > 1,
      winners: (a.winners ?? []).map((w) => {
        const p = people[secure(w.athlete?.$ref)] ?? {};
        const pid = refId(w.athlete?.$ref, 'athletes');
        const tid = refId(w.team?.$ref, 'teams');
        return {
          id: pid,
          name:
            p.displayName ??
            p.fullName ??
            ([p.firstName, p.lastName].filter(Boolean).join(' ') ||
              // ESPN lists only the team for some Coach of the Year awards.
              (/coach/i.test(a.name ?? '') ? COACH_OF_YEAR[lg]?.[season] ?? (abbr[tid] ? `${abbr[tid]} head coach` : 'Head coach') : '')),
          headshot: p.headshot?.href ?? (pid ? `https://a.espncdn.com/i/headshots/${lg}/players/full/${pid}.png` : ''),
          pos: p.position?.abbreviation ?? '',
          isCoach: /coach/i.test(a.name ?? ''), // coaches have no player page or contract
          teamId: tid,
          teamAbbr: abbr[tid] ?? '',
        };
      }),
    }))
    .filter((a) => a.winners.length)
    .sort((x, y) => rank(x.id) - rank(y.id));
}

/** Most recent season (current or one of the last few) that has awards. */
export async function getLatestAwards(lg, opts) {
  const cur = currentSeason(lg);
  for (const yr of [cur, cur - 1, cur - 2]) {
    try {
      const a = await getAwards(lg, yr, opts);
      if (a?.length) return { season: yr, awards: a };
    } catch { /* try an earlier season */ }
  }
  return { season: cur - 1, awards: [] };
}

/** Salary history and current contract details. */
export async function getContracts(lg, id, opts) {
  const o = { ttl: 6 * 60 * 60_000, ...opts };
  const list = await get(`${CORE(lg)}/athletes/${id}/contracts?limit=40`, o);
  const refs = (list.items ?? []).map((x) => secure(x.$ref));
  const [rows, abbr] = await Promise.all([pool(refs, 8, (u) => get(u, o)), teamAbbrMap(lg)]);
  const seasons = rows
    .filter(Boolean)
    .map((c) => {
      const season = Number(refId(c.season?.$ref, 'seasons'));
      const tid = refId(c.team?.$ref, 'teams');
      return {
        season,
        salary: typeof c.salary === 'number' ? c.salary : null,
        bonus: typeof c.bonus === 'number' ? c.bonus : null,
        remaining: typeof c.salaryRemaining === 'number' ? c.salaryRemaining : null,
        yearsRemaining: typeof c.yearsRemaining === 'number' ? c.yearsRemaining : null,
        signedThrough: c.signedThrough ?? null,
        active: !!c.active,
        teamId: tid,
        teamAbbr: abbr[tid] ?? '',
      };
    })
    .filter((c) => c.season)
    .sort((a, b) => b.season - a.season);
  // ESPN tags every contract season with the player's current team (Brunson's
  // Dallas years show as Knicks), so past seasons use the team from his career
  // stats. A season he missed (injury) takes the team of the next one he played.
  const now = currentSeason(lg);
  const stats = await get(`${web(lg)}/athletes/${id}/stats`, o).catch(() => null);
  const played = {}; // season -> team id (the last team if traded mid-season)
  for (const r of stats?.categories?.[0]?.statistics ?? []) {
    if (r.season?.year && r.teamId) played[r.season.year] = String(r.teamId);
  }
  const years = Object.keys(played).map(Number).sort((a, b) => a - b);
  for (const c of seasons) {
    if (c.season > now || !years.length) continue;
    const yr = played[c.season] ? c.season : years.find((y) => y > c.season);
    const tid = yr && played[yr];
    if (tid && abbr[tid]) {
      c.teamId = tid;
      c.teamAbbr = abbr[tid];
    }
  }
  const current = seasons.find((c) => c.active) ?? seasons[0] ?? null;
  return { current, seasons };
}

// ---------- Playoff games (actual results for the bracket) ----------

function normPlayoffEvent(e) {
  const c = e.competitions?.[0] ?? {};
  const score = (x) => {
    const v = x.score?.displayValue ?? x.score;
    return v == null || v === '' ? null : Number(v);
  };
  return {
    id: e.id,
    date: e.date,
    // Old seasons have no round label; the bracket works the round out from the seeds.
    round: c.notes?.[0]?.headline || (e.seasonType?.type === 3 ? 'PLAYOFFS' : ''),
    state: c.status?.type?.state ?? e.status?.type?.state ?? 'pre',
    teams: (c.competitors ?? []).map((x) => ({ id: x.team?.id, score: score(x), winner: !!x.winner })),
  };
}

/** Every postseason game for a season (empty until the playoffs start). */
export async function getPlayoffGames(lg, season, opts) {
  const past = season && season < currentSeason(lg);
  const o = { ttl: past ? 6 * 60 * 60_000 : 60_000, ...opts };
  const yr = season || currentSeason(lg);
  // Nothing to fetch before the postseason starts (NBA Play-In ~mid April; NFL ~early January).
  const postseasonStart = lg === 'nfl' ? new Date(yr + 1, 0, 5) : new Date(yr, 3, 8);
  if (Date.now() < postseasonStart.getTime()) return [];
  const events = [];
  if (lg === 'nfl') {
    const weeks = await pool([1, 2, 3, 4, 5], 5, (w) => get(`${site(lg)}/scoreboard?seasontype=3&week=${w}&dates=${yr}`, o));
    for (const d of weeks) for (const e of d?.events ?? []) events.push(e);
    // Old seasons: the weekly feed may only have the Super Bowl; each team's schedule has the rest.
    if (events.length < 9) {
      const confs = await getStandings(lg, yr, opts);
      const ids = confs.flatMap((c) => c.teams.map((t) => t.id));
      const results = await pool(ids, 8, (id) => get(`${site(lg)}/teams/${id}/schedule?season=${yr}&seasontype=3`, o));
      for (const d of results) for (const e of d?.events ?? []) events.push(e);
    }
  } else {
    const confs = await getStandings(lg, yr, opts);
    // Before the Play-In (2021) ESPN's old seeds aren't reliable, so check every team.
    const ids = confs.flatMap((c) => c.teams.filter((t) => yr < 2021 || t.seed <= 10).map((t) => ({ id: t.id, seed: t.seed })));
    const jobs = [
      ...ids.map((t) => `${site(lg)}/teams/${t.id}/schedule?season=${yr}&seasontype=3`),
      ...ids.filter((t) => yr >= 2021 && t.seed >= 7).map((t) => `${site(lg)}/teams/${t.id}/schedule?season=${yr}&seasontype=5`),
    ];
    const results = await pool(jobs, 8, (u) => get(u, o));
    for (const d of results) for (const e of d?.events ?? []) events.push(e);
  }
  const seen = new Set();
  return events
    .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)))
    .map(normPlayoffEvent)
    .filter((g) => g.round && !/pro bowl/i.test(g.round));
}

// ---------- On this day ----------

/**
 * The best individual performance on this date in each of the past `years`
 * seasons (NBA: points; NFL: passing, rushing or receiving yards, scaled so a
 * 150-yard rusher counts like a 350-yard passer). Old dates never change, so
 * these are cached for a day.
 */
export async function getOnThisDay(lg, date = new Date(), years = 15) {
  const o = { ttl: 24 * 60 * 60_000 };
  const mmdd = toKey(date).slice(4);
  const first = firstSeason(lg, 'leaders');
  const list = Array.from({ length: years }, (_, i) => date.getFullYear() - 1 - i).filter((y) => y >= first - 1);
  const days = await pool(list, 4, (y) => get(`${site(lg)}/scoreboard?dates=${y}${mmdd}`, o).then((d) => ({ y, d })));
  const scale = { points: 1, passingYards: 1 / 350, rushingYards: 1 / 150, receivingYards: 1 / 150 };
  const unit = { points: 'PTS', passingYards: 'pass yds', rushingYards: 'rush yds', receivingYards: 'rec yds' };
  const out = [];
  for (const day of days) {
    if (!day) continue;
    let best = null;
    for (const e of day.d?.events ?? []) {
      const c = e.competitions?.[0] ?? {};
      if (c.status?.type?.state !== 'post') continue;
      const comps = c.competitors ?? [];
      const leaders = lg === 'nba' ? comps.flatMap((x) => (x.leaders ?? []).map((l) => ({ ...l, team: x.team }))) : (c.leaders ?? []);
      for (const cat of leaders) {
        if (!(cat.name in scale)) continue;
        const l = cat.leaders?.[0];
        if (!l?.athlete) continue;
        const score = (Number(l.value) || 0) * scale[cat.name];
        if (!best || score > best.score) {
          const home = comps.find((x) => x.homeAway === 'home') ?? comps[0];
          const away = comps.find((x) => x.homeAway === 'away') ?? comps[1];
          const teamId = l.team?.id ?? l.athlete?.team?.id ?? cat.team?.id;
          best = {
            score,
            year: day.y,
            gameId: e.id,
            player: { id: l.athlete.id, name: (l.athlete.displayName ?? '').length > 17 ? l.athlete.shortName ?? l.athlete.displayName : l.athlete.displayName, headshot: headshotOf(l.athlete) },
            stat: `${Math.round(Number(l.value))} ${unit[cat.name]}`,
            teamAbbr: [home, away].find((x) => x?.team?.id === teamId)?.team?.abbreviation ?? cat.team?.abbreviation ?? '',
            line: `${away?.team?.abbreviation} ${away?.score} · ${home?.team?.abbreviation} ${home?.score}`,
          };
        }
      }
    }
    // Only real highlights: 25+ points, or a big yardage day.
    if (best && best.score >= (lg === 'nba' ? 25 : 0.75)) out.push(best);
  }
  return out;
}

// ---------- Top players of the day ----------

const n0 = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
/** "4-9" or "21/31" -> [4, 9]. */
const pairOf = (v) => String(v ?? '').split(/[-/]/).map(n0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** NBA: John Hollinger's Game Score, one number for a whole box score line. */
function nbaRatings(s) {
  const out = [];
  for (const t of s.boxscore?.players ?? []) {
    const st = t.statistics?.[0];
    const keys = st?.keys ?? [];
    for (const a of st?.athletes ?? []) {
      if (!a.athlete?.id || a.didNotPlay || !a.stats?.length) continue;
      const v = Object.fromEntries(keys.map((k, i) => [k, a.stats[i]]));
      const [fgm, fga] = pairOf(v['fieldGoalsMade-fieldGoalsAttempted']);
      const [ftm, fta] = pairOf(v['freeThrowsMade-freeThrowsAttempted']);
      const [pts, reb, ast, stl, blk, to, oreb, dreb, pf] = ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'offensiveRebounds', 'defensiveRebounds', 'fouls'].map((k) => n0(v[k]));
      const rating = pts + 0.4 * fgm - 0.7 * fga - 0.4 * (fta - ftm) + 0.7 * oreb + 0.3 * dreb + stl + 0.7 * ast + 0.7 * blk - 0.4 * pf - to;
      const line = [`${pts} PTS`, `${reb} REB`, `${ast} AST`];
      if (stl >= 3) line.push(`${stl} STL`);
      if (blk >= 3) line.push(`${blk} BLK`);
      out.push({ athlete: a.athlete, team: t.team, rating, line: line.join(' · ') });
    }
  }
  return out;
}

/** NFL: fantasy-style points (offense, defense, kicking and returns together). */
function nflRatings(s) {
  const by = new Map();
  for (const t of s.boxscore?.players ?? []) {
    for (const cat of t.statistics ?? []) {
      for (const a of cat.athletes ?? []) {
        if (!a.athlete?.id) continue;
        const v = Object.fromEntries((cat.keys ?? []).map((k, i) => [k, a.stats?.[i]]));
        const p = by.get(a.athlete.id) ?? { athlete: a.athlete, team: t.team, rating: 0, parts: [] };
        let pts = 0;
        let text = '';
        const td = (n) => (n ? `, ${n} TD` : '');
        if (cat.name === 'passing') {
          const [yds, tds, int] = [n0(v.passingYards), n0(v.passingTouchdowns), n0(v.interceptions)];
          pts = yds / 25 + 4 * tds - 2 * int;
          text = `${v['completions/passingAttempts']}, ${yds} yds${td(tds)}${int ? `, ${int} INT` : ''}`;
        } else if (cat.name === 'rushing') {
          const [yds, tds] = [n0(v.rushingYards), n0(v.rushingTouchdowns)];
          pts = yds / 10 + 6 * tds;
          text = `${yds} rush yds${td(tds)}`;
        } else if (cat.name === 'receiving') {
          const [rec, yds, tds] = [n0(v.receptions), n0(v.receivingYards), n0(v.receivingTouchdowns)];
          pts = rec * 0.5 + yds / 10 + 6 * tds;
          text = `${rec} rec, ${yds} yds${td(tds)}`;
        } else if (cat.name === 'fumbles') {
          pts = -2 * n0(v.fumblesLost);
        } else if (cat.name === 'defensive') {
          const [tkl, sacks, tfl, pd, tds] = [n0(v.totalTackles), n0(v.sacks), n0(v.tacklesForLoss), n0(v.passesDefended), n0(v.defensiveTouchdowns)];
          pts = tkl * 0.75 + sacks * 3 + tfl + pd * 1.5 + tds * 6;
          text = [plural(tkl, 'tackle'), sacks && plural(sacks, 'sack'), pd >= 2 && `${pd} PD`, tds && `${tds} TD`].filter(Boolean).join(', ');
        } else if (cat.name === 'interceptions') {
          const [int, tds] = [n0(v.interceptions), n0(v.interceptionTouchdowns)];
          pts = int * 5;
          text = `${int} INT${tds ? ' (TD)' : ''}`;
        } else if (cat.name === 'kickReturns' || cat.name === 'puntReturns') {
          const tds = n0(v.kickReturnTouchdowns ?? v.puntReturnTouchdowns);
          pts = tds * 6;
          text = tds ? `${tds} return TD` : '';
        } else if (cat.name === 'kicking') {
          const [fgm, fga] = pairOf(v['fieldGoalsMade/fieldGoalAttempts']);
          pts = n0(v.totalKickingPoints);
          text = `${fgm}/${fga} FG`;
        }
        p.rating += pts;
        if (text) p.parts.push({ pts, text });
        by.set(a.athlete.id, p);
      }
    }
  }
  return [...by.values()].map((p) => ({
    ...p,
    line: p.parts.sort((a, b) => b.pts - a.pts).slice(0, 2).map((x) => x.text).join(' · '),
  }));
}

const rated = new Map(); // `${lg}:${gameId}` -> that game's players (finished games never change)

/**
 * The best players of one finished or live game (a normalized scoreboard game), best
 * first. Remembered for the session, so each box score is only read once.
 */
export async function getGameTop(lg, g, limit = 10) {
  const key = `${lg}:${g.id}`;
  const live = g.status?.state === 'in';
  // A live game's numbers keep moving, so its list is only reused for a minute.
  const had = rated.get(key);
  if (had && (!had.until || had.until > Date.now())) return had.list;
  const url = `${site(lg)}/summary?event=${g.id}`;
  const s = await get(url, { ttl: 60_000, fresh: live });
  const list = (lg === 'nba' ? nbaRatings(s) : nflRatings(s))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
    .map((p) => {
      const mine = String(p.team?.id) === String(g.home.id) ? g.home : g.away;
      const opp = mine === g.home ? g.away : g.home;
      return {
        id: p.athlete.id,
        name: p.athlete.displayName,
        headshot: headshotOf(p.athlete) || `https://a.espncdn.com/i/headshots/${lg}/players/full/${p.athlete.id}.png`,
        teamAbbr: mine.abbr,
        result: `${live ? '' : `${mine.winner ? 'W' : opp.winner ? 'L' : 'T'} `}${mine.score}-${opp.score} ${mine === g.home ? 'vs' : '@'} ${opp.abbr}`,
        live,
        gameId: g.id,
        side: mine === g.home ? 'home' : 'away',
        rating: Math.round(p.rating * 10) / 10,
        line: p.line,
      };
    });
  // Box scores are big (about half a megabyte each); keep only what's shown.
  if (list.length) { rated.set(key, { list, until: live ? Date.now() + 60_000 : 0 }); cache.delete(url); }
  return list;
}

// ---------- Trades and roster moves ----------

const MOVE_KINDS = [
  ['trade', /\btraded\b|\bacquired\b|\btrade\b/i],
  ['cut', /\bwaived\b|\breleased\b|\bterminated\b|\bcut\b/i],
  ['injury', /injured reserve|\binjur|physically unable|\bsuspended\b|non-football|\binactive\b/i],
  ['sign', /signed|\bclaimed\b|\bactivated\b|\bpromoted\b|\brecalled\b|\bexercised\b|\bextension\b|\bconverted\b|\bassigned\b|\belevated\b|\bdesignated\b|\breinstated\b|\bhired\b|\bnamed\b/i],
];
const moveKind = (text) => MOVE_KINDS.find(([, re]) => re.test(text))?.[0] ?? 'other';

// Player names in a move: runs of capitalized words, minus the position in
// front ("F Dalen Terry", "Gs Bruce Brown and Dink Pate") and any team names.
const SEQ_RE = /[A-Z][A-Za-z.'’-]*(?:\s+(?:[A-Z][A-Za-z.'’-]*))+/g;
function namesIn(text, teamWords) {
  const body = String(text).replace(/^[A-Z][a-z-]+\s+/, ''); // drop the verb: "Signed", "Waived"
  const out = [];
  for (const m of body.matchAll(SEQ_RE)) {
    let words = m[0].replace(/[’']s\b/g, '').replace(/[.,]+$/, '').split(/\s+/);
    const pos = /^[A-Z]{1,3}s?\.?$/.test(words[0]) && words.length > 2;
    if (pos) words = words.slice(1);
    if (words.length < 2 || words.length > 4) continue;
    // A name right after a position is a player even if it looks like a place ("RB DeeJay Dallas").
    if (!pos && words.some((w) => teamWords.has(w.toLowerCase()) || /^(Draft|Round|Pick|Reserve|List|Injured|League|Exhibit|Two-Way)$/i.test(w))) continue;
    out.push(words.join(' '));
  }
  return [...new Set(out)];
}

const people = new Map(); // `${lg}:${name}` -> promise of { id, name, headshot } or null
const plainName = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();

/**
 * Looks a player up by name (for lists that only give names). When several
 * players share the name, the one on one of `teamIds` wins, then the best
 * known active one. Null if nobody matches.
 */
export function findPlayer(lg, name, teamIds = []) {
  const key = `${lg}:${name}:${teamIds.join(',')}`;
  if (!people.has(key)) {
    const url = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=6&type=player`;
    people.set(key, get(url, { ttl: 60 * 60_000 }).then((d) => {
      cache.delete(url); // the answers are bulky; only the match is kept
      const hits = (d.items ?? []).filter((x) => x.league === lg && plainName(x.displayName) === plainName(name));
      // "A.J. Woods" is listed as "AJ Woods"; search again without the dots.
      if (!hits.length) return name.includes('.') ? findPlayer(lg, name.replaceAll('.', ''), teamIds) : null;
      const onTeam = (x) => (x.teamRelationships ?? []).some((t) => teamIds.includes(String(t.core?.id)));
      const rank = (x) => (onTeam(x) ? 2e12 : 0) + (x.isActive ? 1e12 : 0) + (Number(x.relevance) || 0);
      const hit = hits.sort((p, q) => rank(q) - rank(p))[0];
      return { id: hit.id, name: hit.displayName, headshot: hit.headshot?.href || `https://a.espncdn.com/i/headshots/${lg}/players/full/${hit.id}.png` };
    }).catch(() => { people.delete(key); return null; }));
  }
  return people.get(key);
}

/**
 * Recent trades, signings and other roster moves, newest first. ESPN dates
 * these by day only (no time of day). `page` starts at 1.
 */
export async function getMoves(lg, page = 1, { team, ...opts } = {}) {
  const [d, confs] = await Promise.all([
    get(`${site(lg)}/transactions?limit=${team ? 40 : 100}&page=${page}${team ? `&team=${team}` : ''}`, { ttl: 5 * 60_000, ...opts }),
    getTeams(lg).catch(() => []),
  ]);
  const teams = confs.flatMap((c) => c.divisions.flatMap((x) => x.teams)).map((x) => ({ id: x.id, abbr: x.abbr, name: x.name, short: x.short, place: x.name.replace(new RegExp(`\\s+${x.short}$`), '') }));
  // "Charlotte" names one team; "Los Angeles" doesn't, so it's never matched alone.
  const placeCount = teams.reduce((m, x) => m.set(x.place, (m.get(x.place) ?? 0) + 1), new Map());
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const teamWords = new Set(teams.flatMap((x) => x.name.toLowerCase().split(/\s+/)));
  const moves = [];
  const trades = new Set();
  const said = new Set();
  for (const [i, t] of (d.transactions ?? []).entries()) {
    const tm = t.team ?? d.team; // a single team's list names the team once, at the top
    const team = { id: tm?.id, abbr: tm?.abbreviation, name: tm?.displayName, short: tm?.name };
    const day = String(t.date ?? '').slice(0, 10);
    // One entry can hold several moves: "Signed X. Placed Y on injured reserve."
    const parts = String(t.description ?? '').split(/\.\s+(?=[A-Z][a-z-]+ed\b)/).map((x) => x.trim().replace(/\.$/, '')).filter(Boolean);
    parts.forEach((text, j) => {
      const kind = moveKind(text);
      let other = null;
      let gets = null; // trades: who ends up with what
      if (kind === 'trade') {
        const others = teams.filter((x) => x.id !== team.id);
        other = others.find((x) => text.includes(x.name)) ?? others.find((x) => placeCount.get(x.place) === 1 && new RegExp(`\\b${esc(x.place)}\\b`).test(text));
        if (other) {
          const who = `(?:the )?(?:${esc(other.name)}|${esc(other.place)})`;
          const got = text.match(new RegExp(`^Acquired (.+?),? (?:pending a physical,? )?from ${who}(?:,? in exchange)?(?: for (.+))?$`, 'i'));
          const sent = text.match(new RegExp(`^Traded (.+?) to ${who}(?:,? in exchange)?(?: for (.+))?$`, 'i'));
          if (got) gets = [{ team, what: got[1] }, got[2] && { team: other, what: got[2] }].filter(Boolean);
          else if (sent) gets = [{ team: other, what: sent[1] }, sent[2] && { team, what: sent[2] }].filter(Boolean);
          // Both teams report the same trade; show it once.
          // ESPN sometimes lists it again the next day in other words, so match on the players, not the day.
          const who2 = namesIn(text, teamWords).map((n) => n.split(' ').slice(0, 2).join(' ')).sort().join('+');
          const pair = `${who2 || day}:${[team.id, other.id].sort().join('-')}`;
          if (trades.has(pair)) return;
          trades.add(pair);
        }
      }
      // ESPN repeats some moves a day later, word for word; keep the newest.
      const same = `${team.id}:${text.toLowerCase()}`;
      if (kind !== 'trade' && said.has(same)) return;
      said.add(same);
      if (gets) gets = gets.map((g) => ({ ...g, players: namesIn(`Got ${g.what}`, teamWords) }));
      moves.push({ key: `${team ? `t${team}:` : ''}${page}:${i}:${j}`, day, text: `${text}.`, kind, team, other, gets, players: namesIn(text, teamWords) });
    });
  }
  return { moves, more: (d.pageIndex ?? page) < (d.pageCount ?? 1) };
}
