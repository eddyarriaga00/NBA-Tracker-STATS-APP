// "Big performance" alerts: any player in any game doing something you
// shouldn't miss. Works from an ESPN game summary (box score + play-by-play).
// Each moment has a unique key so it's only ever sent once per game.
//
// Plain JavaScript so the server (Deno) and local tests (Node) share it.

const ORD = ['', '1st', '2nd', '3rd', '4th'];
const periodName = (lg, p) => (p <= 4 ? `${ORD[p]} quarter` : p === 5 ? 'OT' : `${p - 4}OT`);

// Thresholds. Milestones fire once each (30, then 40, then 50…).
export const RULES = {
  nba: {
    quarterPoints: 15, // 15+ points in a single quarter (or OT)
    points: [30, 40, 50, 60, 70],
    rebounds: [20, 25, 30],
    assists: [15, 20],
    threes: [8, 10, 12],
    blocks: [7, 10],
    steals: [7],
  },
  nfl: {
    passingYards: [350, 400, 450, 500],
    passingTouchdowns: [4, 5, 6],
    rushingYards: [150, 200, 250],
    rushingTouchdowns: [3, 4],
    receivingYards: [150, 200, 250],
    receivingTouchdowns: [3, 4],
    sacks: [3, 4, 5],
    interceptions: [2, 3], // defensive picks
  },
};

const num = (v) => {
  const n = parseFloat(String(v ?? '').split(/[-/]/)[0]);
  return Number.isFinite(n) ? n : 0;
};
const passed = (milestones, value) => milestones.filter((m) => value >= m);

/** Every player's stats as { id, name, team, stats: { key: number } }. */
export function players(summary) {
  const out = new Map();
  for (const team of summary.boxscore?.players ?? []) {
    const abbr = team.team?.abbreviation ?? '';
    const teamId = String(team.team?.id ?? '');
    for (const cat of team.statistics ?? []) {
      // Same names mean different things by category: a QB's "sacks" are sacks
      // taken and his "interceptions" are thrown; a defender's are made.
      const rename = {
        passing: { 'sacks-sackYardsLost': 'timesSacked', interceptions: 'interceptionsThrown' },
        interceptions: { interceptions: 'defInterceptions' },
      }[cat.name] ?? {};
      const keys = (cat.keys ?? []).map((k) => rename[k] ?? k);
      for (const a of cat.athletes ?? []) {
        const id = a.athlete?.id;
        if (!id) continue;
        const p = out.get(id) ?? { id, name: a.athlete.displayName, short: a.athlete.shortName ?? a.athlete.displayName, team: abbr, teamId, stats: {} };
        keys.forEach((k, i) => {
          // "3-7" style cells: the first number is what was made.
          const base = k.split(/[-/]/)[0];
          if (!(base in p.stats)) p.stats[base] = num(a.stats?.[i]);
        });
        out.set(id, p);
      }
    }
  }
  return [...out.values()];
}

/** NBA points per player per quarter, from scoring plays. */
export function quarterPoints(summary) {
  const pts = {}; // `${period}:${athleteId}` -> points
  for (const p of summary.plays ?? []) {
    if (!p.scoringPlay) continue;
    const who = p.participants?.[0]?.athlete?.id;
    const per = p.period?.number;
    if (!who || !per) continue;
    const k = `${per}:${who}`;
    pts[k] = (pts[k] ?? 0) + (Number(p.scoreValue) || 0);
  }
  return pts;
}

function nbaLine(s) {
  const parts = [`${s.points} PTS`];
  if (s.rebounds >= 5) parts.push(`${s.rebounds} REB`);
  if (s.assists >= 5) parts.push(`${s.assists} AST`);
  if (s.threePointFieldGoalsMade >= 4) parts.push(`${s.threePointFieldGoalsMade} 3PM`);
  return parts.join(', ');
}

/**
 * All big moments in this game right now.
 * Returns [{ key, title, body }]; the caller sends the ones not sent before.
 */
export function bigMoments(lg, summary) {
  const out = [];
  const people = players(summary);
  const add = (key, title, body) => out.push({ key, title, body });

  if (lg === 'nba') {
    const R = RULES.nba;
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const [k, v] of Object.entries(quarterPoints(summary))) {
      if (v < R.quarterPoints) continue;
      const [per, id] = k.split(':');
      const p = byId.get(id);
      if (!p) continue;
      add(`q${per}:${id}`, `🔥 ${p.name}: ${v} in the ${periodName(lg, Number(per))}`, `${p.team} · ${nbaLine(p.stats)} so far`);
    }
    for (const p of people) {
      const s = p.stats;
      for (const m of passed(R.points, s.points)) add(`pts${m}:${p.id}`, `🔥 ${p.name} has ${s.points} points`, `${p.team} · ${nbaLine(s)}`);
      const doubles = ['points', 'rebounds', 'assists', 'steals', 'blocks'].filter((k) => s[k] >= 10).length;
      if (doubles >= 3) add(`td:${p.id}`, `Triple-double: ${p.name}`, `${p.team} · ${s.points} PTS, ${s.rebounds} REB, ${s.assists} AST`);
      for (const m of passed(R.rebounds, s.rebounds)) add(`reb${m}:${p.id}`, `${p.name} has ${s.rebounds} rebounds`, `${p.team} · ${nbaLine(s)}`);
      for (const m of passed(R.assists, s.assists)) add(`ast${m}:${p.id}`, `${p.name} has ${s.assists} assists`, `${p.team} · ${nbaLine(s)}`);
      for (const m of passed(R.threes, s.threePointFieldGoalsMade)) add(`3pm${m}:${p.id}`, `🎯 ${p.name} has ${s.threePointFieldGoalsMade} threes`, `${p.team} · ${nbaLine(s)}`);
      for (const m of passed(R.blocks, s.blocks)) add(`blk${m}:${p.id}`, `${p.name} has ${s.blocks} blocks`, `${p.team} · ${nbaLine(s)}`);
      for (const m of passed(R.steals, s.steals)) add(`stl${m}:${p.id}`, `${p.name} has ${s.steals} steals`, `${p.team} · ${nbaLine(s)}`);
    }
  } else {
    const R = RULES.nfl;
    const stat = [
      ['passingYards', 'passing yards', (s) => `${s.passingYards} yds, ${s.passingTouchdowns} TD`],
      ['passingTouchdowns', 'passing TDs', (s) => `${s.passingYards} yds, ${s.passingTouchdowns} TD`],
      ['rushingYards', 'rushing yards', (s) => `${s.rushingYards} yds, ${s.rushingTouchdowns ?? 0} TD`],
      ['rushingTouchdowns', 'rushing TDs', (s) => `${s.rushingYards} yds, ${s.rushingTouchdowns} TD`],
      ['receivingYards', 'receiving yards', (s) => `${s.receptions ?? 0} rec, ${s.receivingYards} yds, ${s.receivingTouchdowns ?? 0} TD`],
      ['receivingTouchdowns', 'receiving TDs', (s) => `${s.receptions ?? 0} rec, ${s.receivingYards} yds, ${s.receivingTouchdowns} TD`],
      ['sacks', 'sacks', (s) => `${s.sacks} sacks, ${s.totalTackles ?? 0} tackles`],
      ['defInterceptions', 'interceptions', (s) => `${s.defInterceptions} INT`],
    ];
    const ruleOf = { defInterceptions: R.interceptions };
    for (const p of people) {
      for (const [k, label, line] of stat) {
        const v = p.stats[k];
        if (v == null) continue;
        for (const m of passed(ruleOf[k] ?? R[k], v)) add(`${k}${m}:${p.id}`, `🔥 ${p.name}: ${v} ${label}`, `${p.team} · ${line(p.stats)}`);
      }
    }
  }
  // When several milestones are passed at once (e.g. 30 and 40), only the
  // highest is worth a notification; the rest are still marked as sent.
  return out;
}

/** Of the new moments, which to actually send (highest milestone per player/stat). */
export function worthSending(moments) {
  const best = new Map();
  for (const m of moments) {
    const [kind, id] = m.key.split(':');
    const group = `${kind.replace(/\d+$/, '')}:${id}`;
    const n = Number(kind.match(/\d+$/)?.[0] ?? 0);
    const cur = best.get(group);
    if (!cur || n > cur.n) best.set(group, { n, m });
  }
  return [...best.values()].map((x) => x.m);
}
