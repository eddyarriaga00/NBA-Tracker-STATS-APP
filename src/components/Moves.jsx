import { Link } from 'react-router-dom';
import { getMoves } from '../api/espn';
import { useData } from '../lib/useData';
import { useSeen } from '../lib/useSeen';
import { Card, TeamLogo } from './ui';

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

/** One move. Trades show both teams and who ends up with what. */
export function MoveRow({ m, lg, showDay = false }) {
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
          <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{m.team.short} · {m.other.short}</span>
          {when}
          {badge}
        </div>
        {m.gets ? (
          <div className="mt-2 space-y-1">
            {m.gets.map((g) => (
              <div key={g.team.id} className="flex items-baseline gap-2 text-[13.5px] leading-snug">
                <span className="w-[68px] shrink-0 text-[12px] font-semibold text-label-2">{g.team.abbr} get</span>
                <span className="min-w-0 flex-1">{g.what}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[13.5px] leading-snug">{m.text}</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 px-3.5 py-3 md:px-4">
      <Link to={`/${lg}/team/${m.team.id}`} aria-label={m.team.name} className="mt-0.5 active:opacity-60"><TeamLogo abbr={m.team.abbr} size={28} league={lg} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-label-2">{m.team.name}</span>
          {when}
          {badge}
        </div>
        <p className="mt-0.5 text-[14px] leading-snug">{m.text}</p>
      </div>
    </div>
  );
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
            {top.map((m) => <MoveRow key={m.key} m={m} lg={lg} showDay />)}
          </Card>
        </>
      )}
    </section>
  );
}
