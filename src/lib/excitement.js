// "Is this game worth watching?" from the score and clock only, so it works
// without spoiling who won. Thresholds per league are easy to tune here.
const CLOSE = { nba: 5, nfl: 8 }; // live: within this many points late in the game
const THRILLER = { nba: 3, nfl: 3 }; // final margin for "Thriller"
const TIGHT = { nba: 6, nfl: 7 }; // final margin for "Close finish"

const secondsLeft = (clock) => {
  const s = String(clock ?? '');
  if (s.includes(':')) {
    const [m, x] = s.split(':').map(Number);
    return (m || 0) * 60 + (x || 0);
  }
  return Number(s) || 0;
};

/**
 * @returns {{ label: string, hot: boolean } | null}
 *   label is safe to show in spoiler-free mode (it never says who leads).
 */
export function gameHeat(g) {
  // No badge for a game that wasn't played, or one ESPN has no score for.
  if (!g || g.status.state === 'pre' || g.status.postponed || g.status.noScore) return null;
  const lg = g.league;
  const a = g.away.score ?? 0;
  const h = g.home.score ?? 0;
  const margin = Math.abs(a - h);
  const period = g.status.period || 0;
  const ot = period > 4;
  if (g.status.state === 'in') {
    const late = ot || (period === 4 && secondsLeft(g.status.clock) <= (lg === 'nfl' ? 8 * 60 : 6 * 60));
    if (ot) return { label: 'Overtime', hot: true };
    if (late && margin <= CLOSE[lg]) return { label: 'Close game', hot: true };
    return null;
  }
  if (g.status.state === 'post') {
    if (ot || /OT/.test(g.status.label)) return { label: 'Overtime thriller', hot: true };
    if (margin <= THRILLER[lg]) return { label: 'Thriller', hot: true };
    if (margin <= TIGHT[lg]) return { label: 'Close finish', hot: false };
  }
  return null;
}
