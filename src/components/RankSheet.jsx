import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getStatRanking, teamHref } from '../api/espn';
import { useData } from '../lib/useData';
import { Skeleton, TeamLogo } from './ui';

/** Every team in the league for one stat, best first; this game's teams highlighted. */
export default function RankSheet({ lg, stat, mark = [], season, onClose }) {
  const { data, error } = useData(() => getStatRanking(lg, stat.key, season), [lg, stat.key, season]);
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={stat.label} onClick={(e) => e.stopPropagation()}
        className="rise flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl md:max-w-md md:rounded-3xl">
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-[17px] font-bold">{stat.label}</h2>
          <button onClick={onClose} className="rounded-full bg-fill px-3 py-1 text-[13px] font-semibold text-accent">Done</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-3">
          {!data && !error && <div className="space-y-2 px-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>}
          {((error && !data) || data?.length === 0) && <p className="px-4 text-[13px] text-label-2">League numbers aren't available right now.</p>}
          {data?.map((t) => {
            const me = mark.map(String).includes(t.id);
            return (
              <Link key={t.id} to={teamHref(lg, t.id)} onClick={onClose}
                className={`flex items-center gap-3 px-4 py-2 text-[14px] ${me ? 'bg-fill font-semibold' : ''}`}>
                <span className="num w-9 shrink-0 text-[12px] text-label-2">{t.rank}</span>
                <TeamLogo abbr={t.abbr} size={22} league={lg} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="num font-semibold">{fmt(t.value)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

