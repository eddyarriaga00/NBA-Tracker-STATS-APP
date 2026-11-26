// Betting lines: formatting, what they imply, and how they finished.

const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/^[ou]/i, ''));
  return Number.isFinite(n) ? n : null;
};

/** ESPN's line for one game, in one shape whether it came from the scoreboard or the game feed.
 *  `homeLine` is the home team's spread (−3 = home favoured by 3). */
export function normOdds(o, pc) {
  if (!o && !pc) return null;
  const sb = o ?? {};
  const p = pc ?? {};
  const close = (side, k) => sb[k]?.[side]?.close;
  const open = (side, k) => sb[k]?.[side]?.open;
  const homeLine = num(close('home', 'pointSpread')?.line) ?? num(p.spread ?? sb.spread);
  const total = num(p.overUnder ?? sb.overUnder ?? close('over', 'total')?.line);
  const out = {
    provider: p.provider?.name ?? sb.provider?.name ?? '',
    details: p.details ?? sb.details ?? '',
    homeLine,
    total,
    awayML: num(p.awayTeamOdds?.moneyLine ?? close('away', 'moneyline')?.odds),
    homeML: num(p.homeTeamOdds?.moneyLine ?? close('home', 'moneyline')?.odds),
    awaySpreadOdds: num(p.awayTeamOdds?.spreadOdds ?? close('away', 'pointSpread')?.odds),
    homeSpreadOdds: num(p.homeTeamOdds?.spreadOdds ?? close('home', 'pointSpread')?.odds),
    overOdds: num(p.overOdds ?? close('over', 'total')?.odds),
    underOdds: num(p.underOdds ?? close('under', 'total')?.odds),
    open: sb.pointSpread || sb.total || sb.moneyline
      ? {
          homeLine: num(open('home', 'pointSpread')?.line),
          total: num(open('over', 'total')?.line),
          awayML: num(open('away', 'moneyline')?.odds),
          homeML: num(open('home', 'moneyline')?.odds),
        }
      : null,
  };
  if (out.homeLine == null && out.total == null && out.homeML == null && !out.details) return null;
  return out;
}

/** Fill gaps in one line from another (game feed + scoreboard). */
export function mergeOdds(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const m = { ...b };
  for (const [k, v] of Object.entries(a)) if (v != null && v !== '') m[k] = v;
  m.open = a.open ?? b.open;
  return m;
}

export const fmtOdds = (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
export const fmtLine = (v) => (v == null ? '–' : v === 0 ? 'PK' : v > 0 ? `+${v}` : String(v));

/** "CHI -1.5" style label for the favourite. */
export function lineLabel(o, away, home) {
  if (!o) return '';
  if (o.homeLine == null) return o.details;
  if (o.homeLine === 0) return 'Pick’em';
  return o.homeLine < 0 ? `${home.abbr} ${o.homeLine}` : `${away.abbr} -${o.homeLine}`;
}

/** Win chances the moneylines imply, with the bookmaker's cut taken out. */
export function impliedOdds(o) {
  const p = (ml) => (ml == null ? null : ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100));
  const a = p(o?.awayML);
  const h = p(o?.homeML);
  if (a == null || h == null) return null;
  return { away: (a / (a + h)) * 100, home: (h / (a + h)) * 100 };
}

/** After the game: who covered the spread, and whether the total went over. */
export function lineResult(o, g) {
  if (!o || g.status.state !== 'post' || g.status.noScore || g.status.postponed) return null;
  const hs = Number(g.home.score);
  const as = Number(g.away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  let spread = null;
  if (o.homeLine != null) {
    const m = hs - as + o.homeLine;
    spread = m === 0 ? { push: true } : { winner: m > 0 ? 'home' : 'away', by: Math.abs(m) };
  }
  let total = null;
  if (o.total != null) {
    const sum = hs + as;
    total = sum === o.total ? { push: true, sum } : { over: sum > o.total, sum };
  }
  return spread || total ? { spread, total } : null;
}
