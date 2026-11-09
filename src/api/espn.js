import { buildQuarterStats } from '../lib/quarterStats';
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
export function seasonOptions(lg, back = 4) {
  const cur = currentSeason(lg);
  return Array.from({ length: back + 1 }, (_, i) => ({ value: cur - i, label: seasonLabel(lg, cur - i) }));
}

const inflight = new Map();

async function get(url, { ttl = 15_000, fresh = false } = {}) {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.data;
  // Share one request when several parts of the page ask for the same URL.
  const key = `${fresh ? 'F' : 'C'}${url}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchWithRetry(url, fresh, hit).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function fetchWithRetry(url, fresh, hit) {
  let lastErr;
  // Retry transient failures twice with a short backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
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
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
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
    abbr: t.abbreviation,
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
export async function getNbaScoreboard(dateKey, opts) {
  const data = await get(`${site('nba')}/scoreboard?dates=${dateKey}`, opts);
  return sortGames((data.events ?? []).map((e) => normGame('nba', e)));
}

/**
 * NFL: games in a week. With no week given, ESPN returns the current week.
 * Returns the games plus the season calendar so the UI can build a week picker.
 */
export async function getNflScoreboard(sel, opts) {
  const q = sel ? `?seasontype=${sel.type}&week=${sel.week}&dates=${sel.year}` : '';
  const data = await get(`${site('nfl')}/scoreboard${q}`, opts);
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

export async function getGame(lg, id, opts) {
  const s = await get(`${site(lg)}/summary?event=${id}`, opts);
  const comp = s.header?.competitions?.[0] ?? {};
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
    preview: normPreview(lg, s, away, home),
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
    venue: info.venue?.fullName ?? '',
    city: [info.venue?.address?.city, info.venue?.address?.state].filter(Boolean).join(', '),
    attendance: info.attendance,
    weather: info.weather ? `${info.weather.temperature ?? ''}° ${info.weather.displayValue ?? ''}`.trim() : '',
    broadcast: (comp.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean).join(', '),
  };
}

// ---------- Preview (odds, predictor, injuries, form, series) ----------

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
    abbr: e.team?.abbreviation,
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
  const entries = await Promise.all(
    Object.entries(PAST_SORT[lg]).map(async ([key, spec]) => {
      const { sort, min } = typeof spec === 'string' ? { sort: spec } : spec;
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
              team: { id: a.teamId, abbr: a.teamShortName, name: a.teamShortName, color: '#8e8e93' },
            };
          });
        return [key, list];
      } catch {
        return [key, []];
      }
    })
  );
  return { season: `${seasonLabel(lg, season)} Regular Season`, categories: Object.fromEntries(entries) };
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
  const [rosterR, schedR, postR] = await Promise.allSettled([
    get(`${site(lg)}/teams/${id}/roster`, o),
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
  const groups = raw.length && raw[0]?.items
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
      opp: { id: opp.team?.id, abbr: opp.team?.abbreviation, name: opp.team?.shortDisplayName ?? opp.team?.displayName },
      us: score(me),
      them: score(opp),
      win: me.winner,
      week: e.week?.text ?? '',
      seasonType: e.seasonType?.abbreviation ?? '',
      playoff: e.seasonType?.type === 3 || e.seasonType?.abbreviation === 'post',
      broadcast: c.broadcasts?.[0]?.media?.shortName ?? '',
    };
  });

  schedule.sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    league: lg,
    id: t.id ?? id,
    abbr: t.abbreviation,
    name: t.displayName,
    short: t.shortDisplayName ?? t.name,
    color: hex(t.color),
    record: yr === cur ? t.recordSummary ?? '' : '',
    standing: yr === cur ? t.standingSummary ?? '' : '',
    coach: r.coach?.[0] ? `${r.coach[0].firstName} ${r.coach[0].lastName}` : '',
    season: sch.requestedSeason?.displayName ?? seasonLabel(lg, yr),
    isCurrent: yr === cur,
    groups,
    schedule,
  };
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
  const d = await get(`${site(lg)}/teams/${id}/statistics${past ? `?season=${season}` : ''}`, { ttl: 10 * 60_000, ...opts });
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
  const o = { ttl: 6 * 60 * 60_000, ...opts };
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
          name: p.displayName ?? p.fullName ?? [p.firstName, p.lastName].filter(Boolean).join(' '),
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
  const current = seasons.find((c) => c.active) ?? seasons[0] ?? null;
  return { current, seasons };
}
