// Builds NBA box scores for a single quarter (or overtime) from play-by-play.
//
// ESPN only publishes full-game box scores, but every play names its players:
//   participants[0] = shooter / rebounder / ball handler / fouler / player subbed in
//   participants[1] = assister / blocker / stealer / player subbed out
// Minutes and +/- come from tracking who is on the floor through substitutions.

export const QUARTER_LABELS = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];

const periodSeconds = (p) => (p <= 4 ? 720 : 300);

/** "11:26" -> 686, "45.2" -> 45.2 */
function clockToSeconds(c) {
  if (!c) return 0;
  const s = String(c);
  if (s.includes(':')) {
    const [m, sec] = s.split(':').map(Number);
    return (m || 0) * 60 + (sec || 0);
  }
  return Number(s) || 0;
}

const blank = () => ({
  sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
  oreb: 0, dreb: 0, ast: 0, to: 0, stl: 0, blk: 0, pf: 0, pm: 0, active: false,
});

/**
 * @param rawPlays  ESPN summary `plays` array (raw)
 * @param teams     [{ teamId, athletes: [{ id, starter }] }] from the box score
 * @returns { periods: number[], stats: { [period]: { [athleteId]: line } } }
 */
export function buildQuarterStats(rawPlays, teams) {
  const teamOf = {};
  for (const t of teams) for (const a of t.athletes) teamOf[a.id] = t.teamId;
  const teamIds = teams.map((t) => t.teamId);

  const plays = (rawPlays ?? []).filter((p) => p.period?.number);
  const periods = [...new Set(plays.map((p) => p.period.number))].sort((a, b) => a - b);
  const stats = {};
  const line = (period, id) => ((stats[period] ??= {})[id] ??= blank());

  let livePeriod = null; // the quarter still being played, if any
  let lastLineup = {}; // teamId -> Set of athlete ids on the floor at the end of the previous period

  for (const period of periods) {
    const pp = plays.filter((p) => p.period.number === period);

    // ---- Who started this period? ----
    const lineup = {};
    for (const tid of teamIds) lineup[tid] = new Set();
    if (period === 1) {
      for (const t of teams) for (const a of t.athletes) if (a.starter) lineup[t.teamId].add(a.id);
    } else {
      // Anyone who acts or is subbed out before being subbed in was on the floor at the start.
      const subbedIn = new Set();
      for (const p of pp) {
        const ids = (p.participants ?? []).map((x) => x.athlete?.id).filter(Boolean);
        if (p.type?.text === 'Substitution') {
          const [inId, outId] = ids;
          if (outId && !subbedIn.has(outId) && teamOf[outId]) lineup[teamOf[outId]]?.add(outId);
          if (inId) subbedIn.add(inId);
        } else if (!/jump ?ball/i.test(p.type?.text ?? '')) {
          for (const id of ids) if (!subbedIn.has(id) && teamOf[id]) lineup[teamOf[id]]?.add(id);
        }
      }
      // A player who played the whole period without touching the ball: fill from last lineup.
      for (const tid of teamIds) {
        for (const id of lastLineup[tid] ?? []) {
          if (lineup[tid].size >= 5) break;
          if (!subbedIn.has(id)) lineup[tid].add(id);
        }
      }
    }

    // ---- Walk the period ----
    const onSince = {}; // athleteId -> clock seconds when they checked in
    const len = periodSeconds(period);
    for (const tid of teamIds) for (const id of lineup[tid]) { onSince[id] = len; line(period, id).active = true; }

    let foulLineup = null;
    let foulClock = null;
    for (const p of pp) {
      const ids = (p.participants ?? []).map((x) => x.athlete?.id).filter(Boolean);
      const [a, b] = ids;
      const typeText = p.type?.text ?? '';
      const text = (p.text ?? '').toLowerCase();
      const t = clockToSeconds(p.clock?.displayValue);
      if (foulLineup && t !== foulClock) foulLineup = null; // the clock ran, so the foul's free throws are done

      if (typeText === 'Substitution') {
        const tid = teamOf[a] ?? teamOf[b];
        if (b && onSince[b] != null) { line(period, b).sec += onSince[b] - t; delete onSince[b]; }
        lineup[tid]?.delete(b);
        if (a) { onSince[a] = t; lineup[tid]?.add(a); line(period, a).active = true; }
        continue;
      }

      if (p.shootingPlay && a) {
        const s = line(period, a);
        s.active = true;
        if (/free throw/i.test(typeText)) {
          s.fta++;
          if (p.scoringPlay) { s.ftm++; s.pts += 1; }
        } else if (/heave/i.test(typeText) && !p.scoringPlay) {
          // Missed end-of-quarter heaves don't count as attempts in official NBA stats.
        } else {
          const three = p.pointsAttempted === 3 || text.includes('three point');
          s.fga++;
          if (three) s.tpa++;
          if (p.scoringPlay) {
            s.fgm++;
            if (three) s.tpm++;
            s.pts += p.scoreValue || (three ? 3 : 2);
            if (b) line(period, b).ast++;
          } else if (b && text.includes('block')) {
            line(period, b).blk++;
          }
        }
      } else if (/offensive rebound/i.test(typeText) && a) {
        line(period, a).oreb++;
      } else if (/defensive rebound/i.test(typeText) && a) {
        line(period, a).dreb++;
      } else if (a && (text.includes('turnover') || /turnover|traveling/i.test(typeText))) {
        line(period, a).to++;
        if (b && text.includes('steal')) line(period, b).stl++;
      }

      // Personal fouls (offensive fouls are also listed separately as turnovers).
      const isFoul = a && /foul|charge/i.test(typeText) && !/turnover|technical/i.test(typeText) && !p.shootingPlay;
      if (isFoul) {
        line(period, a).pf++;
        if (b && /double personal/i.test(typeText)) line(period, b).pf++;
        // Free throws from this foul are credited to whoever was on the floor when it happened,
        // even if substitutions come in between the free throws.
        foulLineup = Object.fromEntries(teamIds.map((tid) => [tid, new Set(lineup[tid])]));
        foulClock = t;
      }

      // +/- for everyone on the floor when points go up.
      if (p.scoringPlay && p.scoreValue) {
        const scorer = p.team?.id ?? teamOf[a];
        const ft = /free throw/i.test(typeText) && !/technical/i.test(typeText);
        const floor = ft && foulLineup ? foulLineup : lineup;
        for (const tid of teamIds) {
          for (const id of floor[tid]) line(period, id).pm += tid === scorer ? p.scoreValue : -p.scoreValue;
        }
      }

    }

    // Finished periods run to 0:00; a live period only up to the latest play's clock.
    const ended = pp.some((p) => /end (period|game)/i.test(p.type?.text ?? ''));
    const endClock = ended ? 0 : clockToSeconds(pp[pp.length - 1]?.clock?.displayValue);
    for (const [id, since] of Object.entries(onSince)) line(period, id).sec += Math.max(0, since - endClock);
    stats[period] ??= {};
    if (!ended) livePeriod = period;
    lastLineup = Object.fromEntries(teamIds.map((tid) => [tid, new Set(lineup[tid])]));
  }

  // Who is on the floor right now (only meaningful while a period is in progress).
  const onCourt = livePeriod && lastLineup ? Object.values(lastLineup).flatMap((set) => [...set]) : [];
  return { periods, stats, livePeriod, onCourt };
}

const fmtMin = (sec) => {
  if (!sec) return '0';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
};

/** A stat line in the same column order as QUARTER_LABELS. */
export function formatLine(s) {
  return [
    fmtMin(s.sec),
    String(s.pts),
    `${s.fgm}-${s.fga}`,
    `${s.tpm}-${s.tpa}`,
    `${s.ftm}-${s.fta}`,
    String(s.oreb + s.dreb),
    String(s.ast),
    String(s.to),
    String(s.stl),
    String(s.blk),
    String(s.oreb),
    String(s.dreb),
    String(s.pf),
    s.pm > 0 ? `+${s.pm}` : String(s.pm),
  ];
}

/** Sum of several lines (used for team totals). */
export function sumLines(lines) {
  const t = blank();
  for (const l of lines) for (const k of Object.keys(t)) if (typeof t[k] === 'number') t[k] += l[k];
  return t;
}
