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

async function get(url, { ttl = 15_000, fresh = false } = {}) {
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.data;
  let lastErr;
  // Retry transient failures twice with a short backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ESPN request failed (${res.status})`);
      const data = await res.json();
      cache.set(url, { at: Date.now(), data });
      return data;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (hit) return hit.data; // serve stale data rather than nothing
  throw lastErr;
}

const pad = (n) => String(n).padStart(2, '0');
export const toKey = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
export const fromKey = (k) => new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8));

export const logoUrl = (lg, abbr, dark = false) =>
  abbr ? `https://a.espncdn.com/i/teamlogos/${lg}/500${dark ? '-dark' : ''}/${abbr.toLowerCase()}.png` : '';

const headshotOf = (a) => (typeof a?.headshot === 'string' ? a.headshot : a?.headshot?.href);
const hex = (c, fallback = '#888888') => (c ? `#${c}` : fallback);

function normStatus(status, date) {
  const t = status?.type ?? {};
  const state = t.state ?? 'pre'; // pre | in | post
  let label = t.shortDetail ?? '';
  if (state === 'pre' && t.name === 'STATUS_SCHEDULED' && date) {
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
  return {
    id: t.id,
    abbr: t.abbreviation,
    name: t.shortDisplayName ?? t.name,
    location: t.location,
    full: t.displayName,
    color: hex(t.color),
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
  return {
    downDistance: s.shortDownDistanceText ?? '',
    full: s.downDistanceText ?? '',
    possession: s.possession ?? null,
    redZone: !!s.isRedZone,
    lastPlay: s.lastPlay?.text?.trim() ?? '',
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
    status: normStatus(e.status ?? comp.status, e.date),
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

  const info = s.gameInfo ?? {};
  return {
    id,
    league: lg,
    date: comp.date,
    status: normStatus(comp.status, comp.date),
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

export async function getStandings(lg, opts) {
  const url = lg === 'nfl' ? `${standingsUrl(lg)}?level=3` : standingsUrl(lg);
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

export async function getLeaders(lg, opts) {
  const d = await get(leadersUrl(lg), { ttl: 5 * 60_000, ...opts });
  const cats = d.leaders?.categories ?? [];
  return {
    season: d.currentSeason?.displayName ?? '',
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

  let gamelog = null;
  if (log?.events) {
    const rows = [];
    for (const st of log.seasonTypes ?? []) {
      for (const cat of st.categories ?? []) {
        for (const e of cat.events ?? []) {
          const meta = log.events[e.eventId];
          if (!meta) continue;
          rows.push({
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
    gamelog = { labels: log.labels ?? [], names: log.displayNames ?? [], rows };
  }

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

  return { league: lg, bio, splits, gamelog, career: careerStats, news };
}

// ---------- Teams ----------

export async function getTeam(lg, id, opts) {
  const o = { ttl: 60_000, ...opts };
  const [rosterR, schedR] = await Promise.allSettled([
    get(`${site(lg)}/teams/${id}/roster`, o),
    get(`${site(lg)}/teams/${id}/schedule`, o),
  ]);
  if (rosterR.status !== 'fulfilled' && schedR.status !== 'fulfilled') throw rosterR.reason;
  const r = rosterR.status === 'fulfilled' ? rosterR.value : {};
  const sch = schedR.status === 'fulfilled' ? schedR.value : {};
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
        title: { offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams' }[g.position] ?? g.position,
        players: (g.items ?? []).map(toPlayer),
      }))
    : [{ title: 'Roster', players: raw.map(toPlayer) }];

  const schedule = (sch.events ?? []).map((e) => {
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
      broadcast: c.broadcasts?.[0]?.media?.shortName ?? '',
    };
  });

  return {
    league: lg,
    id: t.id ?? id,
    abbr: t.abbreviation,
    name: t.displayName,
    short: t.shortDisplayName ?? t.name,
    color: hex(t.color),
    record: t.recordSummary ?? '',
    standing: t.standingSummary ?? '',
    coach: r.coach?.[0] ? `${r.coach[0].firstName} ${r.coach[0].lastName}` : '',
    season: sch.requestedSeason?.displayName ?? '',
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
