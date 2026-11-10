import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getNbaScoreboard, getNflScoreboard, toKey } from '../api/espn';
import { scoresDelay } from '../lib/livePolling';
import { useSpoilers } from '../lib/settings';
import { useData } from '../lib/useData';
import { TeamLogo } from './ui';

/** The day's other games along the top of a game page, to hop between them. */
export default function GameStrip({ g }) {
  const lg = g.league;
  const day = toKey(new Date(g.date));
  const spoilers = useSpoilers();
  const { data } = useData(
    async (fresh) => (lg === 'nba' ? getNbaScoreboard(day, { fresh }) : (await getNflScoreboard(null, { fresh })).games.filter((x) => toKey(new Date(x.date)) === day)),
    ['strip', lg, day],
    { pollMs: scoresDelay }
  );
  const here = useRef(null);
  const n = data?.length ?? 0;
  useEffect(() => { here.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [n, g.id]);
  if (n < 2 || !data.some((x) => String(x.id) === String(g.id))) return null;
  // Live first, then upcoming, then finished; this game stays wherever that puts it.
  const rank = { in: 0, pre: 1, post: 2 };
  const games = [...data].sort((a, b) => rank[a.status.state] - rank[b.status.state] || new Date(a.date) - new Date(b.date));
  return (
    <div className="no-scrollbar -mx-3 mb-2 flex gap-2 overflow-x-auto px-3 md:mx-0 md:px-0">
      {games.map((x) => {
        const cur = String(x.id) === String(g.id);
        const live = x.status.state === 'in';
        const hide = spoilers.hidden(x);
        const pre = x.status.state === 'pre';
        return (
          <Link
            key={x.id}
            ref={cur ? here : undefined}
            to={`/${lg}/game/${x.id}`}
            replace
            aria-current={cur ? 'page' : undefined}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 transition active:scale-95 ${cur ? 'bg-card ring-2 ring-accent' : 'bg-card/70'}`}
          >
            <div className={`flex items-center justify-center gap-1 text-[10.5px] font-semibold ${live ? 'text-live' : 'text-label-2'}`}>
              {live && <span className="live-dot h-[5px] w-[5px] rounded-full bg-live" />}
              {x.status.label}
            </div>
            <div className="num mt-0.5 flex items-center gap-1.5 text-[14px] font-bold">
              <TeamLogo abbr={x.away.abbr} size={18} />
              {pre ? <span className="text-[12px] font-semibold text-label-2">{x.away.abbr} @ {x.home.abbr}</span> : hide ? <span className="text-label-3">– · –</span> : (
                <span><span className={x.status.state === 'post' && !x.away.winner ? 'text-label-2' : ''}>{x.away.score}</span><span className="px-1 text-label-3">·</span><span className={x.status.state === 'post' && !x.home.winner ? 'text-label-2' : ''}>{x.home.score}</span></span>
              )}
              <TeamLogo abbr={x.home.abbr} size={18} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
