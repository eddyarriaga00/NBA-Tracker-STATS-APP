import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LEAGUES, getNbaScoreboard, getNflScoreboard, getTeams, searchPlayers, toKey } from '../api/espn';
import { searchProfiles, socialEnabled } from '../lib/social';
import { Headshot, TeamLogo } from './ui';
import { UserAvatar } from './People';
import { Icon } from './icons';

// Places in the app you can jump to by name.
const PAGES = [
  ['Scores', '', 'games today schedule'],
  ['Standings', '/standings', 'table playoffs seeds'],
  ['Leaders', '/leaders', 'stats leaders top players'],
  ['Teams', '/teams', 'all teams'],
  ['Trades & Moves', '/moves', 'trades signings transactions released injuries'],
  ['Compare players', '/compare', 'versus head to head'],
  ['Picks', '/picks', 'predictions leaderboard'],
].flatMap(([label, path, words]) => Object.keys(LEAGUES).map((lg) => ({ label, to: `/${lg}${path}`, league: lg, words })))
  .concat([
    { label: 'Friends', to: '/friends', words: 'people requests' },
    { label: 'Chat', to: '/chat', words: 'messages talk' },
    { label: 'Settings', to: '/settings', words: 'alerts notifications theme account' },
    { label: 'About', to: '/about', words: '' },
  ]);

const RECENT_KEY = 'recentSearches';
function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
}

/** Every word typed has to appear somewhere in the text. */
const matches = (text, term) => term.split(/\s+/).every((w) => text.includes(w));

/** Today's NBA games and this week's NFL games, loaded once the search opens. */
function useGameIndex(open) {
  const [games, setGames] = useState([]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    Promise.all([
      getNbaScoreboard(toKey(new Date())).catch(() => []),
      getNflScoreboard().then((d) => d.games ?? []).catch(() => []),
    ]).then((all) => alive && setGames(all.flat().filter((g) => !g.home.tbd && !g.away.tbd)));
    return () => { alive = false; };
  }, [open]);
  return games;
}

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
  const [people, setPeople] = useState([]);
  const [recent, setRecent] = useState(readRecent);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const teams = useTeamIndex();
  const games = useGameIndex(open);

  /** Remember what was opened, newest first, so it's one tap away next time. */
  const remember = (item) => {
    const next = [item, ...readRecent().filter((r) => r.to !== item.to)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    setRecent(next);
  };
  const clearRecent = () => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* private mode */ }
    setRecent([]);
  };

  useEffect(() => {
    if (!open) return;
    setQ(''); // start fresh each time, with recent searches on top
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

  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (!socialEnabled || term.length < 2) { setPeople([]); return; }
    let alive = true;
    const t = setTimeout(() => searchProfiles(term).then((r) => alive && setPeople(r.slice(0, 5))).catch(() => alive && setPeople([])), 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const term = q.trim().toLowerCase();
  const teamHits = useMemo(() => {
    if (term.length < 2) return [];
    return teams
      .filter((t) => matches(`${t.name} ${t.short} ${t.abbr}`.toLowerCase(), term))
      .sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0))
      .slice(0, 6);
  }, [teams, term, league]);
  const playerHits = useMemo(
    () => [...players].sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0)).slice(0, 12),
    [players, league]
  );

  const gameHits = useMemo(() => {
    if (term.length < 2) return [];
    return games
      .filter((g) => matches([g.away, g.home].map((t) => `${t.full} ${t.name} ${t.abbr}`).join(' ').toLowerCase(), term))
      .sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0))
      .slice(0, 4);
  }, [games, term, league]);
  const pageHits = useMemo(() => {
    if (term.length < 2) return [];
    return PAGES
      .filter((p) => matches(`${p.label} ${p.words} ${p.league ?? ''}`.toLowerCase(), term))
      .sort((a, b) => (a.league === league ? -1 : 0) - (b.league === league ? -1 : 0))
      .slice(0, 4);
  }, [term, league]);

  if (!open) return null;

  const first = teamHits[0]
    ? `/${teamHits[0].league}/team/${teamHits[0].id}`
    : gameHits[0]
      ? `/${gameHits[0].league}/game/${gameHits[0].id}`
      : playerHits[0]
        ? `/${playerHits[0].league}/player/${playerHits[0].id}`
        : pageHits[0]?.to ?? (people[0] ? `/u/${people[0].user_id}` : null);
  const nothing = !busy && !teamHits.length && !gameHits.length && !playerHits.length && !pageHits.length && !people.length;
  const Title = ({ children }) => <div className="mt-5 px-1 text-[13px] font-semibold uppercase tracking-wide text-label-2">{children}</div>;
  const row = 'flex items-center gap-3 px-4 py-2.5 hover:bg-fill/50';
  const list = 'mt-1.5 divide-y divide-sep overflow-hidden rounded-2xl bg-card';

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
              onKeyDown={(e) => { if (e.key === 'Enter' && first) { navigate(first); onClose(); } }}
              placeholder="Players, teams, games, people"
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
            recent.length ? (
              <>
                <div className="mt-5 flex items-center justify-between px-1">
                  <span className="text-[13px] font-semibold uppercase tracking-wide text-label-2">Recent</span>
                  <button onClick={clearRecent} className="text-[13px] text-accent">Clear</button>
                </div>
                <div className={list}>
                  {recent.map((r) => (
                    <Link key={r.to} to={r.to} onClick={onClose} className={row}>
                      {r.kind === 'team' ? <TeamLogo league={r.league} abbr={r.abbr} size={30} /> : r.kind === 'player' ? <Headshot src={r.img} size={34} /> : <Icon.Search className="mx-1.5 h-[18px] w-[18px] text-label-3" />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[16px] font-semibold">{r.name}</div>
                        {r.sub && <div className="truncate text-[12px] text-label-2">{r.sub}</div>}
                      </div>
                      {r.league && <Badge lg={r.league} />}
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-[15px] text-label-2">Search any NBA or NFL player, team or game, people on the app, or a page like Standings.</p>
            )
          ) : nothing ? (
            <p className="py-10 text-center text-[15px] text-label-2">Nothing found for “{q.trim()}”.</p>
          ) : (
            <>
              {teamHits.length > 0 && (
                <>
                  <Title>Teams</Title>
                  <div className={list}>
                    {teamHits.map((t) => (
                      <Link
                        key={`${t.league}${t.id}`}
                        to={`/${t.league}/team/${t.id}`}
                        onClick={() => { remember({ kind: 'team', to: `/${t.league}/team/${t.id}`, name: t.name, sub: t.record, league: t.league, abbr: t.abbr }); onClose(); }}
                        className={row}
                      >
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
              {gameHits.length > 0 && (
                <>
                  <Title>Games</Title>
                  <div className={list}>
                    {gameHits.map((g) => (
                      <Link key={`${g.league}${g.id}`} to={`/${g.league}/game/${g.id}`} onClick={onClose} className={row}>
                        <span className="flex shrink-0 items-center -space-x-1.5">
                          <TeamLogo league={g.league} abbr={g.away.abbr} size={26} />
                          <TeamLogo league={g.league} abbr={g.home.abbr} size={26} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-semibold">{g.away.name} at {g.home.name}</div>
                          <div className="truncate text-[12px] text-label-2">
                            {g.status.state === 'in' ? <span className="font-semibold text-live">Live</span> : g.status.state === 'post' ? 'Final' : `${new Date(g.date).toLocaleDateString([], { weekday: 'short' })} ${g.status.label}`}
                          </div>
                        </div>
                        <Badge lg={g.league} />
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {(busy || playerHits.length > 0) && <Title>Players</Title>}
              {busy && playerHits.length === 0 ? (
                <div className="py-6 text-center text-[14px] text-label-2">Searching…</div>
              ) : playerHits.length > 0 && (
                <div className={list}>
                  {playerHits.map((p) => (
                    <Link
                      key={`${p.league}${p.id}`}
                      to={`/${p.league}/player/${p.id}`}
                      onClick={() => { remember({ kind: 'player', to: `/${p.league}/player/${p.id}`, name: p.name, sub: p.team, league: p.league, img: p.headshot }); onClose(); }}
                      className={row}
                    >
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
              {people.length > 0 && (
                <>
                  <Title>People</Title>
                  <div className={list}>
                    {people.map((u) => (
                      <Link key={u.user_id} to={`/u/${u.user_id}`} onClick={onClose} className={row}>
                        <UserAvatar profile={u} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[16px] font-semibold">{u.display_name}</div>
                          {u.username && <div className="truncate text-[12px] text-label-2">@{u.username}</div>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {pageHits.length > 0 && (
                <>
                  <Title>Pages</Title>
                  <div className={list}>
                    {pageHits.map((p) => (
                      <Link key={p.to} to={p.to} onClick={onClose} className={row}>
                        <div className="min-w-0 flex-1 truncate text-[16px] font-semibold">{p.label}</div>
                        {p.league && <Badge lg={p.league} />}
                        <Icon.ChevronRight className="h-4 w-4 text-label-3" />
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
