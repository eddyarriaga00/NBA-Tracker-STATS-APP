import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LEAGUES, getTeams, searchPlayers } from '../api/espn';
import { Headshot, TeamLogo } from './ui';
import { Icon } from './icons';

function useTeamIndex() {
  const [teams, setTeams] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      Object.keys(LEAGUES).map((lg) =>
        getTeams(lg)
          .then((confs) => confs.flatMap((c) => c.divisions.flatMap((d) => d.teams.map((t) => ({ ...t, league: lg })))))
          .catch(() => [])
      )
    ).then((all) => alive && setTeams(all.flat()));
    return () => { alive = false; };
  }, []);
  return teams;
}

export default function Search({ open, onClose, league }) {
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const teams = useTeamIndex();

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setPlayers([]); setBusy(false); return; }
    setBusy(true);
    let alive = true;
    const t = setTimeout(() => {
      searchPlayers(term)
        .then((r) => alive && setPlayers(r))
        .catch(() => alive && setPlayers([]))
        .finally(() => alive && setBusy(false));
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const term = q.trim().toLowerCase();
  const teamHits = useMemo(() => {
    if (term.length < 2) return [];
    return teams
      .filter((t) => [t.name, t.short, t.abbr].some((x) => x?.toLowerCase().includes(term)))
      .sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0))
      .slice(0, 6);
  }, [teams, term, league]);
  const playerHits = useMemo(
    () => [...players].sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0)).slice(0, 12),
    [players, league]
  );

  if (!open) return null;

  const Badge = ({ lg }) => (
    <span className="rounded-md bg-fill px-1.5 py-0.5 text-[10px] font-bold text-label-2">{LEAGUES[lg].name}</span>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/30 backdrop-blur-sm md:items-start md:pt-[10vh]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="rise flex h-full w-full flex-col bg-bg md:h-auto md:max-h-[75vh] md:max-w-xl md:overflow-hidden md:rounded-2xl md:shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-sep px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] md:pt-3">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-fill px-3 py-2">
            <Icon.Search className="h-[18px] w-[18px] text-label-2" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Players and teams"
              className="w-full bg-transparent text-[17px] outline-none placeholder:text-label-3"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {q && (
              <button aria-label="Clear" onClick={() => setQ('')} className="text-label-3">
                <Icon.X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="px-1 text-[17px] text-accent">Cancel</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {term.length < 2 ? (
            <p className="py-10 text-center text-[15px] text-label-2">Search any NBA or NFL player or team.</p>
          ) : (
            <>
              {teamHits.length > 0 && (
                <>
                  <div className="mt-4 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">Teams</div>
                  <div className="mt-1.5 divide-y divide-sep overflow-hidden rounded-2xl bg-card">
                    {teamHits.map((t) => (
                      <Link key={`${t.league}${t.id}`} to={`/${t.league}/team/${t.id}`} onClick={onClose} className="flex items-center gap-3 px-4 py-2.5 hover:bg-fill/50">
                        <TeamLogo league={t.league} abbr={t.abbr} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-semibold">{t.name}</div>
                          <div className="text-[12px] text-label-2">{t.record}</div>
                        </div>
                        <Badge lg={t.league} />
                      </Link>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-5 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">Players</div>
              {busy && playerHits.length === 0 ? (
                <div className="py-6 text-center text-[14px] text-label-2">Searching…</div>
              ) : playerHits.length === 0 ? (
                <div className="py-6 text-center text-[14px] text-label-2">No players found.</div>
              ) : (
                <div className="mt-1.5 divide-y divide-sep overflow-hidden rounded-2xl bg-card">
                  {playerHits.map((p) => (
                    <Link key={`${p.league}${p.id}`} to={`/${p.league}/player/${p.id}`} onClick={onClose} className="flex items-center gap-3 px-4 py-2.5 hover:bg-fill/50">
                      <Headshot src={p.headshot} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold">{p.name}</div>
                        <div className="truncate text-[12px] text-label-2">{p.team}</div>
                      </div>
                      <Badge lg={p.league} />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
