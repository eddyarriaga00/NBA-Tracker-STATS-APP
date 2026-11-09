import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOnThisDay } from '../api/espn';
import { useData } from '../lib/useData';
import { Card, Headshot, TeamLogo } from './ui';

/** "On this day": the best performance on today's date in past seasons. Loads when scrolled into view. */
export default function OnThisDay({ lg }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  const { data } = useData(() => (seen ? getOnThisDay(lg) : null), [lg, seen]);
  const top = data?.length ? data.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const today = new Date().toLocaleDateString([], { month: 'long', day: 'numeric' });

  return (
    <section ref={ref} className="mt-6">
      {data?.length > 0 && (
        <>
          <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:text-[13px]">
            On this day · {today}
          </h2>
          <Card className="rise divide-y divide-sep">
            {data.map((x) => (
              <Link key={x.year} to={`/${lg}/game/${x.gameId}`} className="flex items-center gap-3 px-4 py-2.5 active:bg-fill">
                <span className="num w-10 shrink-0 text-[13px] font-semibold text-label-2">{x.year}</span>
                <Headshot src={x.player.headshot} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14.5px] font-semibold">
                    <span className="truncate">{x.player.name}</span>
                    {x === top && <span aria-label="Best of the day">🔥</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-label-2">
                    {x.teamAbbr && <TeamLogo abbr={x.teamAbbr} size={14} league={lg} />}
                    <span className="num truncate">{x.line}</span>
                  </span>
                </span>
                <span className="num shrink-0 text-right text-[14px] font-bold">{x.stat}</span>
              </Link>
            ))}
          </Card>
        </>
      )}
    </section>
  );
}
