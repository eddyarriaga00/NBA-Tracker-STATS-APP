import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentSeason, getContracts, getPlayer, seasonLabel } from '../api/espn';
import { useData } from '../lib/useData';
import { Headshot, Skeleton, TeamLogo } from './ui';
import { Icon } from './icons';

const BioCtx = createContext({ open: () => {} });
export const useBio = () => useContext(BioCtx);

export const money = (n) => {
  if (n == null) return '–';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};

/** Small "Bio" pill that opens the sheet for a player. */
export function BioButton({ lg, id, className = '' }) {
  const { open } = useBio();
  if (!id) return null;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(lg, id);
      }}
      className={`shrink-0 rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-accent transition hover:bg-fill-strong active:scale-95 ${className}`}
      aria-label="Player bio and salary"
    >
      Bio
    </button>
  );
}

function Contract({ lg, id }) {
  const { data, error, loading } = useData((fresh) => getContracts(lg, id, { fresh }), [lg, id]);
  if (loading && !data) return <Skeleton className="h-[160px] !rounded-2xl" />;
  if (error && !data) return <p className="px-1 text-[13px] text-label-2">Salary info isn't available right now.</p>;
  if (!data?.seasons.length) return <p className="px-1 text-[13px] text-label-2">No salary info for this player.</p>;
  const cur = data.current;
  const max = Math.max(...data.seasons.map((s) => s.salary ?? 0), 1);
  const now = currentSeason(lg);
  // Only count seasons already played or underway; contracts can list future years.
  const career = data.seasons.filter((s) => s.season <= now).reduce((sum, s) => sum + (s.salary ?? 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label={`${seasonLabel(lg, cur.season)} salary`} value={money(cur.salary)} big />
        <Stat label="Career earnings" value={money(career)} sub="Salary from listed seasons" />
        {cur.yearsRemaining != null && <Stat label="Years left" value={String(cur.yearsRemaining)} />}
        {cur.remaining != null && cur.remaining > 0 && <Stat label="Money left on deal" value={money(cur.remaining)} />}
        {cur.signedThrough && <Stat label="Signed through" value={String(cur.signedThrough)} />}
        {cur.bonus != null && cur.bonus > 0 && <Stat label="Bonus" value={money(cur.bonus)} />}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl bg-card-2">
        <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-label-2">Salary by season</span>
          <span className="text-[10.5px] text-label-3">Team holding the contract</span>
        </div>
        <div className="divide-y divide-sep">
          {data.seasons.map((s) => (
            <div key={s.season} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]">
              <span className={`num w-[58px] shrink-0 ${s.season > now ? 'text-label-3' : 'text-label-2'}`}>
                {seasonLabel(lg, s.season)}
                {s.season > now && <span className="block text-[9.5px] leading-none">future</span>}
              </span>
              <span className="flex w-12 shrink-0 items-center gap-1 text-[12px] font-semibold">
                {s.teamAbbr && <TeamLogo abbr={s.teamAbbr} size={16} league={lg} />}
                {s.teamAbbr}
              </span>
              <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full bg-win" style={{ width: `${((s.salary ?? 0) / max) * 100}%` }} />
              </div>
              <span className="num w-14 shrink-0 text-right font-semibold">{money(s.salary)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, big }) {
  return (
    <div className="rounded-xl bg-card-2 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-label-2">{label}</div>
      <div className={`num mt-0.5 font-display font-bold tracking-tight ${big ? 'text-[24px] text-win' : 'text-[18px]'}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-label-3">{sub}</div>}
    </div>
  );
}

function Sheet({ lg, id, onClose }) {
  const { data: p, error, loading } = useData((fresh) => getPlayer(lg, id, { fresh }), [lg, id]);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const b = p?.bio;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Player bio"
        onClick={(e) => e.stopPropagation()}
        className="rise flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl md:max-w-lg md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-fill-strong md:hidden" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5">
          {loading && !p ? (
            <div className="space-y-3"><Skeleton className="h-[80px]" /><Skeleton className="h-[200px]" /></div>
          ) : error && !p ? (
            <p className="py-8 text-center text-[14px] text-label-2">Couldn't load this player.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Headshot src={b.headshot} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-[22px] font-bold leading-tight tracking-tight">{b.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-label-2">
                    {b.team && <TeamLogo abbr={b.team.abbr} size={16} league={lg} />}
                    <span className="truncate">{[b.team?.name, b.position, b.jersey && `#${b.jersey}`].filter(Boolean).join(' · ')}</span>
                  </div>
                  {b.injury && <span className="mt-1 inline-block rounded-full bg-live/12 px-2 py-0.5 text-[11px] font-bold text-live">{b.injury}</span>}
                </div>
                <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-full bg-fill text-label-2">
                  <Icon.X className="h-4 w-4" />
                </button>
              </div>

              <h3 className="mb-2 mt-5 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">Contract</h3>
              <Contract lg={lg} id={id} />

              {b.facts.length > 0 && (
                <>
                  <h3 className="mb-2 mt-5 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">Personal</h3>
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-sep">
                    {b.facts.map(([k, v]) => (
                      <div key={k} className="bg-card-2 px-3 py-2">
                        <div className="text-[11px] text-label-2">{k}</div>
                        <div className="text-[13.5px] font-semibold">{v}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {p.awards?.length > 0 && (
                <>
                  <h3 className="mb-2 mt-5 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">Awards & honors</h3>
                  <div className="divide-y divide-sep overflow-hidden rounded-xl bg-card-2">
                    {p.awards.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 px-3 py-2">
                        <span className="num w-8 shrink-0 pt-0.5 text-[13px] font-bold text-[#c26a00] dark:text-[#ffb340]">{a.count}</span>
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold">{a.name}</div>
                          <div className="text-[11.5px] text-label-2">{a.seasons.map((y) => seasonLabel(lg, y)).join(', ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <Link
                to={`/${lg}/player/${id}`}
                onClick={onClose}
                className="mt-5 block rounded-xl bg-accent py-2.5 text-center text-[15px] font-semibold text-white active:opacity-80"
              >
                Full stats & game log
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function BioProvider({ children }) {
  const [who, setWho] = useState(null);
  const open = useCallback((lg, id) => setWho({ lg, id }), []);
  const close = useCallback(() => setWho(null), []);
  return (
    <BioCtx.Provider value={{ open }}>
      {children}
      {who && <Sheet key={`${who.lg}:${who.id}`} lg={who.lg} id={who.id} onClose={close} />}
    </BioCtx.Provider>
  );
}
