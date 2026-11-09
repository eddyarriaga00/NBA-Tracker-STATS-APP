// Small extras on game cards: win/loss streaks, each team's next game after a
// final, and injuries + recent form before tip-off. All of it is "as of now",
// so it's only shown for today's games (or this NFL week).
import { createContext, useContext, useMemo } from 'react';
import { getNbaScoreboard, getNflScoreboard, getPregame, getStandings, fromKey, toKey } from '../api/espn';
import { useData } from './useData';

export const CardExtras = createContext(null);
export const useCardExtras = () => useContext(CardExtras);

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const HOUR = 3_600_000;

/** teamId -> "W4" from the standings. */
export function useStreaks(lg, on) {
  const { data } = useData(
    async () => {
      if (!on) return null;
      const confs = await getStandings(lg, undefined, { ttl: 10 * 60_000 });
      const out = {};
      for (const c of confs) for (const t of c.teams) if (t.streak) out[t.id] = t.streak;
      return out;
    },
    [lg, on]
  );
  return data;
}

/**
 * teamId -> { date, opp, home } for each team's next game.
 * NBA looks a few days ahead; NFL looks at next week.
 */
export function useNextGames(lg, { on, dateKey, nextWeek }) {
  const { data } = useData(
    async () => {
      if (!on) return null;
      let games = [];
      if (lg === 'nba') {
        const day = fromKey(dateKey);
        const lists = await Promise.all(
          [1, 2, 3, 4].map((n) => getNbaScoreboard(toKey(addDays(day, n)), { ttl: 30 * 60_000 }).catch(() => []))
        );
        games = lists.flat();
      } else if (nextWeek) {
        games = (await getNflScoreboard(nextWeek, { ttl: 30 * 60_000 }).catch(() => ({ games: [] }))).games;
      }
      const out = {};
      for (const g of [...games].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
        if (g.status.state !== 'pre') continue;
        for (const [me, opp, home] of [[g.home, g.away, true], [g.away, g.home, false]]) {
          if (me.id && !out[me.id]) out[me.id] = { id: g.id, date: g.date, timeValid: g.timeValid, opp: opp.abbr, home };
        }
      }
      return out;
    },
    [lg, on, dateKey, nextWeek && `${nextWeek.type}-${nextWeek.week}-${nextWeek.year}`]
  );
  return data;
}

/** "Wed 7:30 PM vs BOS" (or "Tomorrow …"). */
export function nextLabel(n) {
  const d = new Date(n.date);
  const tomorrow = addDays(new Date(), 1).toDateString() === d.toDateString();
  const day = tomorrow ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' });
  return `${day} ${n.home ? 'vs' : '@'} ${n.opp}`;
}

/** Injuries and last five games for a game starting in the next day and a half. */
export function usePregame(g, on) {
  const soon = on && g.status.state === 'pre' && !g.status.postponed && Date.parse(g.date) - Date.now() < 36 * HOUR;
  const { data } = useData(() => (soon ? getPregame(g.league, g.id) : null), [g.league, g.id, soon]);
  return useMemo(() => {
    if (!data) return null;
    const byTeam = {};
    for (const t of data.injuries ?? []) {
      // Season-long injured reserve isn't news; the ones that matter tonight are.
      const list = t.list.filter((i) => !/injured reserve|suspen/i.test(i.status));
      const out = list.filter((i) => /^out|doubtful/i.test(i.status));
      const gtd = list.filter((i) => /day-to-day|questionable|game.?time/i.test(i.status));
      byTeam[t.teamId] = { ...byTeam[t.teamId], out, gtd };
    }
    for (const t of data.lastFive ?? []) {
      byTeam[t.teamId] = { ...byTeam[t.teamId], form: t.games.map((x) => x.result).filter((r) => r === 'W' || r === 'L').slice(-5) }; // oldest → newest
    }
    return byTeam;
  }, [data]);
}
