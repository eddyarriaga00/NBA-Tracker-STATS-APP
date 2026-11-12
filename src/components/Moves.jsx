import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { findPlayer, getMoves } from '../api/espn';
import { useData } from '../lib/useData';
import { useSeen } from '../lib/useSeen';
import { Card, Skeleton, TeamLogo } from './ui';

export const KINDS = {
  trade: { label: 'Trade', tone: 'bg-accent/12 text-accent' },
  sign: { label: 'Signed', tone: 'bg-win/15 text-win' },
  cut: { label: 'Released', tone: 'bg-live/12 text-live' },
  injury: { label: 'Injury list', tone: 'bg-fill text-label-2' },
  other: { label: 'Move', tone: 'bg-fill text-label-2' },
};

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** "2026-11-10" -> "Today", "Yesterday" or "Sun, Nov 8". ESPN dates moves by day, not by time. */
export function dayLabel(day, long = false) {
  const now = new Date();
  if (day === dayKey(now)) return 'Today';
  if (day === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString([], { weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric', ...(y !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

const Swap = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M7 8h12l-3-3M17 16H5l3 3" />
  </svg>
);

// Player lookups run four at a time so a long list never floods the network.
let running = 0;
const waiting = [];
function lookup(lg, name, teamIds) {
  return new Promise((resolve) => {
    const go = () => {
      running++;
      findPlayer(lg, name, teamIds).then(resolve, () => resolve(null)).finally(() => { running--; waiting.shift()?.(); });
    };
    if (running < 4) go(); else waiting.push(go);
  });
}

/** The players named in a move, matched to their photo and page: { [name]: player }. Starts once `on` is true. */
function usePlayers(lg, m, on) {
  const [found, setFound] = useState({});
  const names = m.players ?? [];
  useEffect(() => {
    if (!on || !names.length) return;
    let alive = true;
    const teamIds = [m.team.id, m.other?.id].filter(Boolean).map(String);
    for (const name of names) {
      lookup(lg, name, teamIds).then((p) => alive && p && setFound((f) => ({ ...f, [name]: p })));
    }
    return () => { alive = false; };
  }, [lg, m.key, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return found;
}

/** A player's photo in a circle; their initials if ESPN has no photo of them. */
function Face({ p, size }) {
  const [failed, setFailed] = useState(false);
  const initials = p.name.split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="grid h-[var(--s)] w-[var(--s)] shrink-0 place-items-center overflow-hidden rounded-full bg-fill" style={{ '--s': `${size}px` }}>
      {failed ? (
        <span className="font-semibold text-label-2" style={{ fontSize: Math.round(size * 0.36) }}>{initials}</span>
      ) : (
        <img src={p.headshot} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" style={{ transform: 'scale(1.35) translateY(8%)' }} />
      )}
    </span>
  );
}

/** Small photo + name, linking to the player's page. */
function PlayerPill({ p, lg }) {
  return (
    <Link to={`/${lg}/player/${p.id}`} className="flex items-center gap-1.5 rounded-full bg-fill py-0.5 pl-0.5 pr-2.5 active:opacity-60">
      <Face p={p} size={24} />
      <span className="text-[12.5px] font-semibold">{p.name}</span>
    </Link>
  );
}

/** One move, with the photos of the players in it. Trades show both teams and who ends up with what. */
export function MoveRow({ m, lg, showDay = false, load = true }) {
  const found = usePlayers(lg, m, load);
  const k = KINDS[m.kind] ?? KINDS.other;
  const badge = <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.tone}`}>{k.label}</span>;
  const when = showDay && <span className="shrink-0 text-[11.5px] text-label-3">{dayLabel(m.day)}</span>;
  if (m.kind === 'trade' && m.other) {
    return (
      <div className="px-3.5 py-3 md:px-4">
        <div className="flex items-center gap-2">
          <Link to={`/${lg}/team/${m.team.id}`} aria-label={m.team.name} className="active:opacity-60"><TeamLogo abbr={m.team.abbr} size={28} league={lg} /></Link>
          <Swap className="h-4 w-4 shrink-0 text-label-3" />
          <Link to={`/${lg}/team/${m.other.id}`} aria-label={m.other.name} className="active:opacity-60"><TeamLogo abbr={m.other.abbr} size={28} league={lg} /></Link>
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
            <span className="min-[430px]:hidden">{m.team.abbr} · {m.other.abbr}</span>
            <span className="max-[429px]:hidden">{m.team.short} · {m.other.short}</span>
          </span>
          {when}
          {badge}
        </div>
        {m.gets ? (
          <div className="mt-2.5 space-y-2.5">
            {m.gets.map((g) => {
              const people = g.players.map((n) => found[n]).filter(Boolean);
              // "DB Jessie Bates" under Jessie Bates's photo adds nothing; picks and extra players do.
              const more = !people.length || people.length < g.players.length || /\b(pick|picks|cash|considerations?|rights|future)\b/i.test(g.what);
              return (
                <div key={g.team.id} className="flex items-start gap-2.5">
                  <span className="flex w-[78px] shrink-0 items-center gap-1.5 whitespace-nowrap pt-0.5 text-[12px] font-semibold text-label-2">
                    <TeamLogo abbr={g.team.abbr} size={16} league={lg} />
                    {g.team.abbr} get
                  </span>
                  <div className="min-w-0 flex-1">
                    {people.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1.5">
                        {people.map((p) => (
                          <Link key={p.id} to={`/${lg}/player/${p.id}`} className="flex items-center gap-2 active:opacity-60">
                            <Face p={p} size={40} />
                            <span className="text-[14.5px] font-semibold">{p.name}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {more && <p className={`leading-snug ${people.length ? 'text-[12.5px] text-label-2' : 'text-[13.5px]'}`}>{g.what}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <p className="mt-1.5 text-[13.5px] leading-snug">{m.text}</p>
            <Pills people={(m.players ?? []).map((n) => found[n]).filter(Boolean)} lg={lg} />
          </>
        )}
      </div>
    );
  }
  const people = (m.players ?? []).map((n) => found[n]).filter(Boolean);
  const star = people.length === 1 ? people[0] : null; // one player: their photo leads the row
  return (
    <div className="flex items-start gap-3 px-3.5 py-3 md:px-4">
      {star ? (
        <Link to={`/${lg}/player/${star.id}`} aria-label={star.name} className="relative mt-0.5 shrink-0 active:opacity-60">
          <Face p={star} size={40} />
          <span className="absolute -bottom-1 -right-1 grid h-[20px] w-[20px] place-items-center rounded-full bg-card">
            <TeamLogo abbr={m.team.abbr} size={15} league={lg} />
          </span>
        </Link>
      ) : (
        <Link to={`/${lg}/team/${m.team.id}`} aria-label={m.team.name} className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center active:opacity-60"><TeamLogo abbr={m.team.abbr} size={30} league={lg} /></Link>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/${lg}/team/${m.team.id}`} className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-label-2 active:opacity-60">{m.team.name}</Link>
          {when}
          {badge}
        </div>
        <p className="mt-0.5 text-[14px] leading-snug">{m.text}</p>
        {!star && <Pills people={people} lg={lg} />}
      </div>
    </div>
  );
}

function Pills({ people, lg }) {
  if (!people.length) return null;
  return <div className="mt-1.5 flex flex-wrap gap-1.5">{people.map((p) => <PlayerPill key={p.id} p={p} lg={lg} />)}</div>;
}

/** The few newest moves (trades first) for the Scores page, with a link to the full list. */
export default function LatestMoves({ lg }) {
  const [ref, seen] = useSeen();
  const { data } = useData(() => (seen ? getMoves(lg) : null), [lg, seen]);
  const weekAgo = dayKey(new Date(Date.now() - 7 * 864e5));
  const recent = (data?.moves ?? []).filter((m) => m.day >= weekAgo);
  const top = [...recent.filter((m) => m.kind === 'trade'), ...recent.filter((m) => m.kind !== 'trade')].slice(0, 4);
  return (
    <section ref={ref} className="mt-6">
      {top.length > 0 && (
        <>
          <h2 className="mb-1.5 flex items-baseline justify-between px-1 text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:text-[13px]">
            <span>Trades &amp; moves</span>
            <Link to={`/${lg}/moves`} className="normal-case tracking-normal text-[13px] font-semibold text-accent active:opacity-60">See all</Link>
          </h2>
          <Card className="rise divide-y divide-sep overflow-hidden">
            {top.map((m) => <MoveRow key={m.key} m={m} lg={lg} showDay load={seen} />)}
          </Card>
        </>
      )}
    </section>
  );
}

/** One team's moves this season, newest first (Team page). */
export function TeamMoves({ lg, id }) {
  const { data, error, loading } = useData((fresh) => getMoves(lg, 1, { team: id, fresh }), [lg, id]);
  const [all, setAll] = useState(false);
  if (loading && !data) return <Skeleton className="h-[220px] !rounded-2xl" />;
  const moves = data?.moves ?? [];
  if (!moves.length) {
    return <Card className="px-4 py-6 text-center text-[14px] text-label-2">{error ? 'Couldn’t load moves. Try again later.' : 'No moves yet this season.'}</Card>;
  }
  const rows = all ? moves : moves.slice(0, 12);
  return (
    <>
      <Card className="rise divide-y divide-sep overflow-hidden">
        {rows.map((m) => <MoveRow key={m.key} m={m} lg={lg} showDay />)}
        {moves.length > rows.length && (
          <button onClick={() => setAll(true)} className="w-full py-2.5 text-[13.5px] font-semibold text-accent active:bg-fill">Show {moves.length - rows.length} more</button>
        )}
      </Card>
      <Link to={`/${lg}/moves`} className="mt-3 block text-center text-[13.5px] font-semibold text-accent active:opacity-60">All {lg.toUpperCase()} trades &amp; moves</Link>
    </>
  );
}
