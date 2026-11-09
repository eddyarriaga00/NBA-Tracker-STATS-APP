import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TeamLogo } from './ui';
import { countdownText } from './GameCard';
import { useFavorites } from '../lib/favorites';
import { useSpoilers } from '../lib/settings';

const ORDER = { in: 0, pre: 1, post: 2 };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

function line(g, me, opp, hide, now) {
  const vs = `${me.homeAway === 'home' ? 'vs' : '@'} ${opp.name}`;
  if (g.status.state === 'in') {
    return {
      title: `${me.name} are live`,
      sub: hide ? `${vs} · score hidden` : `${me.abbr} ${me.score} – ${opp.score} ${opp.abbr} · ${g.status.label}`,
      live: true,
    };
  }
  if (g.status.state === 'post') {
    if (hide) return { title: `${me.name} played today`, sub: `${vs} · tap to see how it went` };
    const won = me.winner;
    return { title: `${me.name} ${won ? 'won' : opp.winner ? 'lost' : 'tied'} ${Math.max(me.score, opp.score)}–${Math.min(me.score, opp.score)}`, sub: `${vs} · ${g.status.label}` };
  }
  const start = Date.parse(g.date);
  const today = sameDay(start, now);
  const evening = new Date(start).getHours() >= 17;
  const when = today ? (evening ? 'tonight' : 'today') : new Date(start).toLocaleDateString([], { weekday: 'long' });
  const time = g.timeValid === false ? 'Time TBD' : new Date(start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const count = today && g.timeValid !== false ? ` · ${countdownText(start, now)}` : '';
  return { title: `${me.name} play ${when}`, sub: `${time} ${vs}${count}` };
}

/** "Your team plays today" strip at the top of Scores. */
export default function MyTeamsToday({ games, league, filter = () => true }) {
  const { isFav } = useFavorites();
  const spoilers = useSpoilers();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000); // keep the countdown moving
    return () => clearInterval(id);
  }, []);
  const rows = (games ?? [])
    .filter(filter)
    .flatMap((g) =>
      [g.home, g.away].filter((t) => isFav(league, t.id)).map((t) => ({ g, me: t, opp: t === g.home ? g.away : g.home }))
    )
    .sort((a, b) => ORDER[a.g.status.state] - ORDER[b.g.status.state] || Date.parse(a.g.date) - Date.parse(b.g.date))
    .slice(0, 3);
  if (!rows.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {rows.map(({ g, me, opp }) => {
        const l = line(g, me, opp, spoilers.hidden(g), now);
        return (
          <Link
            key={`${g.id}:${me.id}`}
            to={`/${league}/game/${g.id}`}
            className="rise flex items-center gap-3 rounded-2xl px-3.5 py-2.5 transition active:scale-[0.985]"
            style={{ background: `linear-gradient(90deg, ${me.color}33, ${me.color}0d)`, boxShadow: `inset 0 0 0 1px ${me.color}40` }}
          >
            <TeamLogo abbr={me.abbr} size={34} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight">
                {l.live && <span className="live-dot h-[7px] w-[7px] shrink-0 rounded-full bg-live" />}
                <span className="truncate">{l.title}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-label-2 num">{l.sub}</span>
            </span>
            <span className="text-[18px] text-label-3" aria-hidden>›</span>
          </Link>
        );
      })}
    </div>
  );
}
