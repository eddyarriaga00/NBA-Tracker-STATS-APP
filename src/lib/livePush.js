import { useEffect, useMemo, useRef, useState } from 'react';
import { follow } from './fastcast';

const SPORT = { nba: 'basketball', nfl: 'football' };
const RELOAD_GAP = 2500; // the full feed is big; follow a push with at most one reload per 2.5s

/** While the push feed is connected, the regular timer only needs to be a safety net. */
export const relaxed = (ms, pushing) => (ms && pushing ? Math.max(ms, 12_000) : ms);

/** Runs `fn` right away, then at most once per `gap` ms while calls keep coming. */
function useThrottled(fn, gap) {
  const ref = useRef({ fn, last: 0, timer: null });
  ref.current.fn = fn;
  useEffect(() => () => clearTimeout(ref.current.timer), []);
  return () => {
    const s = ref.current;
    const wait = s.last + gap - Date.now();
    if (wait <= 0) { s.last = Date.now(); s.fn(); } else if (!s.timer) {
      s.timer = setTimeout(() => { s.timer = null; s.last = Date.now(); s.fn(); }, wait);
    }
  };
}

const secs = (c) => String(c ?? '').split(':').reduce((m, x) => m * 60 + (parseFloat(x) || 0), 0);
/** True when the pushed moment is the same as, or later than, what the page already has. */
const notOlder = (p, g) => {
  const pp = Number(p.period) || 0;
  const gp = Number(g.status.period) || 0;
  return pp > gp || (pp === gp && secs(p.clock) <= secs(g.status.clock) + 0.05);
};

const startsSoon = (g) => g.status.state === 'pre' && !g.status.postponed && new Date(g.date).getTime() - Date.now() < 20 * 60_000;

/**
 * A live game with ESPN's pushed score and clock laid over it, so they change
 * within a second. Each push also asks for a fresh copy of everything else.
 */
export function useGamePush(lg, g, reload, pushing) {
  const [push, setPush] = useState(null);
  if (pushing) pushing.current = !!push;
  const again = useThrottled(reload, RELOAD_GAP);
  const id = g?.id;
  const on = !!g && (g.status.state === 'in' || startsSoon(g));
  useEffect(() => {
    if (!on) { setPush(null); return; }
    return follow(`gp-${SPORT[lg]}-${lg}-${id}`, (doc, live) => {
      const c = doc?.header?.competitions?.[0];
      if (!c) { setPush(null); return; }
      const side = (ha) => c.competitors?.find((x) => x.homeAway === ha);
      const num = (v) => (v == null || v === '' ? null : Number(v));
      const t = c.status?.type ?? {};
      setPush({ id, home: num(side('home')?.score), away: num(side('away')?.score), state: t.state, label: t.shortDetail, clock: c.status?.displayClock, period: c.status?.period });
      if (live) again();
    }, { prefix: '/header' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lg, id, on]);

  return useMemo(() => {
    if (!g || !push || push.id !== g.id || push.state !== 'in' || g.status.state !== 'in' || push.home == null || push.away == null || !notOlder(push, g)) return g;
    return {
      ...g,
      home: { ...g.home, score: push.home },
      away: { ...g.away, score: push.away },
      status: { ...g.status, label: push.label || g.status.label, clock: push.clock ?? g.status.clock, period: push.period ?? g.status.period },
    };
  }, [g, push]);
}

/** The same for a list of games (the Scores page). */
export function useScoresPush(lg, games, reload, pushing) {
  const [byId, setById] = useState(null);
  if (pushing) pushing.current = !!byId;
  const again = useThrottled(reload, RELOAD_GAP);
  const on = !!games?.some((g) => g.status.state === 'in' || startsSoon(g));
  useEffect(() => {
    if (!on) { setById(null); return; }
    return follow(`event-${SPORT[lg]}-${lg}`, (doc, live) => {
      const evs = doc?.sports?.[0]?.leagues?.[0]?.events;
      if (!evs) { setById(null); return; }
      const m = new Map();
      for (const e of evs) {
        const side = (ha) => e.competitors?.find((x) => x.homeAway === ha);
        const num = (v) => (v == null || v === '' ? null : Number(v));
        m.set(String(e.id), { state: e.status, home: num(side('home')?.score), away: num(side('away')?.score), label: e.fullStatus?.type?.shortDetail ?? e.summary, clock: e.fullStatus?.displayClock ?? e.clock, period: e.fullStatus?.period ?? e.period });
      }
      setById(m);
      if (live) again();
    }, { pick: (doc) => doc?.sports?.[0]?.leagues?.[0]?.events });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lg, on]);

  return useMemo(() => {
    if (!games || !byId) return games;
    return games.map((g) => {
      const p = byId.get(String(g.id));
      if (!p || p.state !== 'in' || g.status.state !== 'in' || p.home == null || p.away == null || !notOlder(p, g)) return g;
      if (p.home === g.home.score && p.away === g.away.score && (!p.label || p.label === g.status.label)) return g;
      return {
        ...g,
        home: { ...g.home, score: p.home },
        away: { ...g.away, score: p.away },
        status: { ...g.status, label: p.label || g.status.label, clock: p.clock ?? g.status.clock, period: Number(p.period) || g.status.period },
      };
    });
  }, [games, byId]);
}
