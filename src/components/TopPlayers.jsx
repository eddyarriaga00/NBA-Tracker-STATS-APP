import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getGameTop } from '../api/espn';
import { useSetting } from '../lib/settings';
import { useSeen } from '../lib/useSeen';
import { Card, Headshot, Skeleton, TeamLogo } from './ui';

const Chevron = () => (
  <svg aria-hidden width="8" height="13" viewBox="0 0 8 13" className="shrink-0 text-label-3">
    <path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UNIT = { nba: 'Game score', nfl: 'Fantasy pts' };
const HOW = {
  nba: 'Ranked by Game Score: points, rebounds, assists, steals and blocks, minus misses, turnovers and fouls.',
  nfl: 'Ranked by fantasy-style points: yards, touchdowns and catches, plus tackles, sacks, picks and kicks.',
};

/**
 * The best players across the finished and live games of a day (NBA) or week (NFL),
 * ranked. Fills in as each game ends; loads when scrolled into view.
 */
export default function TopPlayers({ lg, games, label }) {
  const [ref, seen] = useSeen();
  const [spoilerFree] = useSetting('spoilerFree');
  const [shown, setShown] = useState(false); // spoiler-free: tap to reveal
  const [all, setAll] = useState(false);
  const counted = (g) => g.status.state === 'post' || g.status.state === 'in';
  const done = (games ?? []).filter(counted);
  const liveCount = done.filter((g) => g.status.state === 'in').length;
  // Live games are read again as their scores move.
  const ids = done.map((g) => (g.status.state === 'in' ? `${g.id}:${g.away.score}-${g.home.score}` : g.id)).sort().join(',');
  const open = !!(seen && ids && (!spoilerFree || shown));
  // Games are read three at a time and the ranking fills in as each one arrives,
  // so one slow box score never holds up the rest.
  const [state, setState] = useState({ key: '', lists: {}, left: 0 });
  const key = `${lg}:${label}`;
  const gamesRef = useRef(games);
  gamesRef.current = games;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const todo = gamesRef.current.filter((g) => g.status.state === 'post' || g.status.state === 'in');
    setState((s) => (s.key === key ? { ...s, left: todo.length } : { key, lists: {}, left: todo.length }));
    let i = 0;
    const worker = async () => {
      while (alive && i < todo.length) {
        const g = todo[i++];
        const list = await getGameTop(lg, g).catch(() => null);
        if (!alive) return;
        setState((s) => (s.key !== key ? s : { ...s, lists: list ? { ...s.lists, [g.id]: list } : s.lists, left: s.left - 1 }));
      }
    };
    for (let n = 0; n < 3; n++) worker();
    return () => { alive = false; };
  }, [open, key, ids, lg]);
  useEffect(() => setAll(false), [key]);

  const mine = state.key === key ? state : null;
  const got = mine ? Object.keys(mine.lists).length : 0;
  const list = got ? Object.values(mine.lists).flat().sort((a, b) => b.rating - a.rating).slice(0, 10) : mine && mine.left <= 0 ? [] : null;
  // Always the same element, so the scroll watcher keeps watching it once games arrive.
  if (!ids) return <section ref={ref} />;
  const total = games.length;
  const rows = all ? list : list?.slice(0, 5);
  return (
    <section ref={ref} className="mt-6">
      <h2 className="mb-1.5 flex items-baseline gap-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:text-[13px]">
        <span>Top players{label ? ` · ${label}` : ''}</span>
        {liveCount > 0 ? (
          <span className="font-normal normal-case tracking-normal text-label-3">{done.length - liveCount} final · {liveCount} live</span>
        ) : done.length < total ? (
          <span className="font-normal normal-case tracking-normal text-label-3">{done.length} of {total} games final</span>
        ) : mine?.left > 0 && got > 0 ? (
          <span className="font-normal normal-case tracking-normal text-label-3">adding {mine.left} more {mine.left === 1 ? 'game' : 'games'}…</span>
        ) : null}
      </h2>
      {spoilerFree && !shown ? (
        <Card className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[13.5px] text-label-2">Hidden while spoiler-free is on.</span>
          <button onClick={() => setShown(true)} className="rounded-full bg-fill px-3 py-1 text-[13px] font-semibold text-accent active:opacity-70">Show</button>
        </Card>
      ) : !list ? (
        <Skeleton className="h-[290px] !rounded-2xl" />
      ) : !list.length ? null : (
        <Card className="rise overflow-hidden">
          <div className="divide-y divide-sep">
            {rows.map((p, i) => (
              <div key={`${p.gameId}:${p.id}`} className="flex items-center">
                <span className={`num w-9 shrink-0 pl-3.5 text-center text-[15px] font-bold md:pl-4 ${i === 0 ? 'text-accent' : 'text-label-3'}`}>{i + 1}</span>
                <Link to={`/${lg}/player/${p.id}`} aria-label={`${p.name} profile`} className="shrink-0 py-2.5 pl-2 active:opacity-60">
                  <Headshot src={p.headshot} size={40} />
                </Link>
                <Link to={`/${lg}/game/${p.gameId}?tab=${p.side}`} className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 pr-2.5 active:bg-fill md:pr-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                    <span className="num block truncate text-[12.5px] text-label">{p.line}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-label-2">
                      <TeamLogo abbr={p.teamAbbr} size={14} league={lg} />
                      {p.live && <span className="flex shrink-0 items-center gap-1 font-semibold text-live"><span className="live-dot h-[5px] w-[5px] rounded-full bg-live" />Live</span>}
                      <span className="num truncate">{p.result}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[17px] font-bold leading-tight">{p.rating.toFixed(1)}</span>
                    <span className="block text-[10px] font-medium text-label-3">{UNIT[lg]}</span>
                  </span>
                  <Chevron />
                </Link>
              </div>
            ))}
          </div>
          {list.length > 5 && (
            <button onClick={() => setAll((v) => !v)} className="w-full border-t border-sep py-2.5 text-[13.5px] font-semibold text-accent active:bg-fill">
              {all ? 'Show top 5' : `Show top ${list.length}`}
            </button>
          )}
        </Card>
      )}
      {list?.length > 0 && (!spoilerFree || shown) && <p className="mt-1.5 px-1 text-[11.5px] leading-snug text-label-3">{HOW[lg]} Tap a row for the game, or the photo for the player.</p>}
    </section>
  );
}
