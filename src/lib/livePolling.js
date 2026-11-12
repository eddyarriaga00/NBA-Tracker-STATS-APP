// How often pages refresh. Tune live speed here.
// Live scores and clocks also arrive by push (lib/fastcast.js), within about a
// second; while that's connected these timers are only a safety net.
// ESPN refreshes each feed about every 10 seconds; checking every 3 catches a
// new score within a few seconds of ESPN publishing it. (Measured Nov 2026.)
export const LIVE_MS = 3_000;
const SOON_MS = 15_000; // a game starts within 15 minutes
const LATER_MS = 60_000; // games later today

const minutesUntil = (iso) => (new Date(iso).getTime() - Date.now()) / 60_000;

/** Delay for a list of games (Scores page). */
export function scoresDelay(games) {
  if (!games?.length) return 0;
  if (games.some((g) => g.status.state === 'in')) return LIVE_MS;
  const upcoming = games.filter((g) => g.status.state === 'pre' && !g.status.postponed);
  if (upcoming.some((g) => minutesUntil(g.date) < 15)) return SOON_MS; // includes "should have started"
  if (upcoming.some((g) => minutesUntil(g.date) < 12 * 60)) return LATER_MS;
  return 0;
}

/** Delay for a single game page. */
export function gameDelay(g) {
  if (!g) return 0;
  if (g.status.state === 'in') return LIVE_MS;
  if (g.status.state === 'pre' && !g.status.postponed) {
    const m = minutesUntil(g.date);
    if (m < 15) return SOON_MS;
    if (m < 12 * 60) return LATER_MS;
  }
  return 0;
}
