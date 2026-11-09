// Pure football-field math, kept separate so it can be tested without React.

/**
 * Field geometry, in yards from the AWAY team's goal line (0 = away goal on the
 * left, 100 = home goal on the right). Returns null when the spot is unknown
 * (e.g. between plays or during a kickoff).
 */
export function fieldGeometry(sit, home, away) {
  if (!sit) return null;
  const offenseIsHome = sit.possession != null && String(sit.possession) === String(home.id);
  const offenseIsAway = sit.possession != null && String(sit.possession) === String(away.id);
  if (!offenseIsHome && !offenseIsAway) return null;
  const dir = offenseIsHome ? -1 : 1; // home attacks toward the left (away's end zone)

  const toX = (text, fromOwn) => {
    const t = String(text ?? '').trim();
    if (/^50$/.test(t)) return 50;
    const m = t.match(/^([A-Z]{2,4})\s+(\d{1,2})$/);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === home.abbr) return 100 - n;
      if (m[1] === away.abbr) return n;
    }
    if (typeof fromOwn === 'number') return offenseIsHome ? 100 - fromOwn : fromOwn;
    return null;
  };

  const ball = toX(sit.spot, sit.yardLine);
  if (ball == null || ball < 0 || ball > 100) return null;
  const start = toX(sit.driveStart, sit.driveStartYardLine);
  const goal = dir > 0 ? 100 : 0;
  let toGain = null;
  if (sit.goalToGo) toGain = goal;
  else if (typeof sit.distance === 'number' && sit.distance > 0) toGain = Math.max(0, Math.min(100, ball + dir * sit.distance));
  return { ball, start, toGain, dir, offense: offenseIsHome ? home : away, goal };
}

