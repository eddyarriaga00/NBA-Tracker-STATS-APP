import { WithPct, madePct } from '../lib/pct';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getGame, getNflQuarters, getTeamStats, teamHref } from '../api/espn';
import Comments, { useCommentCounts } from '../components/Comments';
import Preview, { Injuries, Series } from '../components/Preview';
import RankSheet from '../components/RankSheet';
import Highlights from '../components/Highlights';
import ShotChart from '../components/ShotChart';
import { HeatBadge } from '../components/GameCard';
import { Icon } from '../components/icons';
import { downloadICS, gameUrl } from '../lib/calendar';
import { useSpoilers } from '../lib/settings';
import { toast } from '../lib/toast';
import { GamePick } from '../components/Picks';
import FootballField from '../components/FootballField';
import GameStrip from '../components/GameStrip';
import GameFlow from '../components/GameFlow';
import RollingNumber from '../components/RollingNumber';
import PullToRefresh from '../components/PullToRefresh';
import { MORPH_NAME, peekGame, setMorph } from '../lib/morph';
import { BackButton, Card, ErrorState, Headshot, LiveBadge, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';
import { gameDelay } from '../lib/livePolling';
import { relaxed, useGamePush } from '../lib/livePush';
import Freshness from '../components/Freshness';
import { formatLine, sumLines } from '../lib/quarterStats';
import { nflQuarterGroups } from '../lib/nflQuarterStats';
import { liveFollowAvailable, useLiveFollow } from '../lib/liveFollow';

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** "Wed, Nov 11", with the year when the game isn't from this year. */
function gameDay(g) {
  const d = new Date(g.date);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (g.timeValid === false) opts.timeZone = 'America/New_York'; // no set time: stored as midnight Eastern
  return d.toLocaleDateString([], opts);
}

function Hero({ g, hide, onReveal }) {
  const { dark } = useTheme();
  const lg = useLeague();
  const { status, home, away } = g;
  const final = status.state === 'post';
  const pre = status.state === 'pre';
  const a = visibleColor(away.color, dark, away.alt);
  const h = visibleColor(home.color, dark, home.alt);
  const day = gameDay(g);

  const Side = ({ t }) => (
    <Link
      to={t.tbd ? '#' : teamHref(lg, t.id, g.seasonYear)}
      onClick={(e) => t.tbd && e.preventDefault()}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 transition active:scale-95"
    >
      <TeamLogo abbr={t.abbr} size={48} className="drop-shadow-sm md:h-20 md:w-20" />
      <div className="text-center">
        <div className="text-[14px] font-semibold leading-tight md:text-[17px]">{t.name}</div>
        <div className="num text-[12px] text-label-2">{hide ? '\u00a0' : t.record}</div>
      </div>
    </Link>
  );

  const scoreCls = 'num font-display text-[36px] font-bold tracking-tight md:text-[56px]';
  const score = (t) =>
    status.state === 'in' ? (
      <RollingNumber value={t.score ?? 0} className={scoreCls} />
    ) : (
      <span className={`${scoreCls} leading-none ${final && !t.winner ? 'text-label-3' : ''}`}>{t.score ?? 0}</span>
    );

  return (
    <Card className="relative overflow-hidden" style={{ viewTransitionName: MORPH_NAME }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14] dark:opacity-[0.22]"
        style={{ background: `linear-gradient(100deg, ${a} 0%, transparent 42%, transparent 58%, ${h} 100%)` }}
      />
      <div className="relative flex items-center gap-1 px-2 py-4 md:gap-2 md:px-8 md:py-8">
        <Side t={away} />
        <div className="flex shrink-0 flex-col items-center gap-2">
          {pre ? (
            <>
              <div className="font-display text-[24px] font-bold tracking-tight md:text-[28px]">
                {status.postponed || !g.timeValid ? status.label || 'TBD' : new Date(g.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="text-[13px] text-label-2">
                {new Date(g.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </>
          ) : status.postponed || status.noScore ? (
            // Never played, or played with no score on ESPN's record: say so instead of "0 – 0".
            <>
              <div className="font-display text-[22px] font-bold tracking-tight md:text-[28px]">{status.postponed ? status.label || 'Postponed' : 'Final'}</div>
              <div className="max-w-[160px] text-center text-[12.5px] leading-snug text-label-2">{status.postponed ? day : `${day} · no score on record`}</div>
            </>
          ) : hide ? (
            <>
              <div className="text-[13px] font-semibold text-label-2">Score hidden</div>
              <button onClick={onReveal} className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white active:scale-95">
                Reveal
              </button>
              <div className="flex flex-col items-center gap-0.5">
                {status.state === 'in' ? <LiveBadge label={status.label} /> : <span className="text-[12px] text-label-2">{status.state === 'post' ? 'Final' : status.label}</span>}
                <span className="text-[11.5px] text-label-3">{day}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 md:gap-6">
                {score(away)}
                <span className="text-[18px] text-label-3">–</span>
                {score(home)}
              </div>
              {/* The status ("Final", "Q3 4:12"), with the day the game was played under it. */}
              <div className="flex flex-col items-center gap-0.5">
                {status.state === 'in' ? <LiveBadge label={status.label} /> : <span className="text-[13px] font-semibold text-label-2">{status.label}</span>}
                <span className="text-[12px] text-label-2 md:text-[13px]">{day}</span>
              </div>
            </>
          )}
        </div>
        <Side t={home} />
      </div>
    </Card>
  );
}

const STAR_UNIT = { nba: 'Game score', nfl: 'Fantasy pts' };

/** The game's best player: "Player of the game" once it's over, "Top performer" while it's on. */
function StarPlayer({ g }) {
  const { dark } = useTheme();
  const lg = useLeague();
  const p = g.star;
  if (!p) return null;
  const team = String(g.home.id) === p.teamId ? g.home : String(g.away.id) === p.teamId ? g.away : null;
  const c = team ? visibleColor(team.color, dark, team.alt) : 'var(--accent)';
  return (
    <Link to={`/${lg}/player/${p.id}`} className="mb-3 block transition active:scale-[0.99]">
      <Card className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.16] dark:opacity-[0.26]" style={{ background: `linear-gradient(100deg, ${c} 0%, transparent 62%)` }} />
        <div className="relative flex items-center gap-3 px-3.5 py-3 md:px-4">
          <Headshot src={p.headshot} size={52} />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#806000] dark:text-[#ffd60a]">
              {g.status.state === 'post' ? '★ Player of the game' : '★ Top performer so far'}
            </div>
            <div className="truncate text-[16px] font-bold leading-tight">{p.name}</div>
            <div className="mt-0.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-label-2">
              {team && <TeamLogo abbr={team.abbr} size={14} className="mt-[2px] shrink-0" />}
              <span className="num text-label">{p.line}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="num text-[20px] font-bold leading-tight">{p.rating.toFixed(1)}</div>
            <div className="text-[10px] font-medium text-label-3">{STAR_UNIT[lg]}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function Timeouts({ n }) {
  if (n == null) return null;
  return (
    <span className="flex gap-1" aria-label={`${n} timeouts left`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 w-3 rounded-full ${i < n ? 'bg-[#ffd60a]' : 'bg-fill-strong'}`} />
      ))}
    </span>
  );
}

function Situation({ g }) {
  const s = g.situation;
  if (g.status.state !== 'in' || !s || (!s.downDistance && !s.lastPlay && !s.spot)) return null;
  const team = s.possession === g.home.id ? g.home : s.possession === g.away.id ? g.away : null;
  const nfl = g.league === 'nfl';
  return (
    <Card className={`mt-3 overflow-hidden px-4 py-3 ${s.redZone ? 'ring-2 ring-live/60' : ''}`}>
      <div className="flex items-center gap-2.5">
        {team && <TeamLogo abbr={team.abbr} size={26} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[15px] font-semibold">
            {team && <span>{team.abbr} ball</span>}
            {s.full || s.downDistance ? (
              <span className={team ? 'text-label-2' : ''}>{s.full || s.downDistance}</span>
            ) : (
              <span className="text-[12px] uppercase tracking-wide text-label-2">Last play</span>
            )}
            {s.redZone && <span className="rounded-full bg-live px-2 py-0.5 text-[11px] font-bold text-white">RED ZONE</span>}
          </div>
        </div>
      </div>
      {nfl && (
        <div className="mt-3">
          <FootballField situation={s} home={g.home} away={g.away} size="lg" />
        </div>
      )}
      {nfl && (s.driveSummary || s.homeTimeouts != null) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[12px] text-label-2">
          {s.driveSummary && (
            <span>
              Drive: <span className="font-semibold text-label">{s.driveSummary}</span>
              {s.driveStart && <> · started at {s.driveStart}</>}
            </span>
          )}
          {s.homeTimeouts != null && (
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">{g.away.abbr} <Timeouts n={s.awayTimeouts} /></span>
              <span className="flex items-center gap-1.5">{g.home.abbr} <Timeouts n={s.homeTimeouts} /></span>
            </span>
          )}
        </div>
      )}
      {s.lastPlay && <div className="mt-2 border-t border-sep pt-2 text-[13px] text-label-2">{s.lastPlay}</div>}
    </Card>
  );
}

function Linescore({ g }) {
  const n = Math.max(g.away.linescores.length, g.home.linescores.length);
  if (!n || g.status.postponed || g.status.noScore) return null;
  const cols = Array.from({ length: Math.max(n, 4) }, (_, i) => i + 1);
  return (
    <Card className="mt-3 overflow-x-auto px-4 py-3">
      <table className="num w-full text-[14px]">
        <thead>
          <tr className="text-[12px] text-label-2">
            <th className="pb-1.5 text-left font-medium" />
            {cols.map((c) => <th key={c} className="w-10 pb-1.5 text-center font-medium">{periodName(c)}</th>)}
            <th className="w-12 pb-1.5 text-center font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {[g.away, g.home].map((t) => (
            <tr key={t.abbr} className="border-t border-sep">
              <td className="py-2">
                <div className="flex items-center gap-2 font-semibold"><TeamLogo abbr={t.abbr} size={20} /> {t.abbr}</div>
              </td>
              {cols.map((c) => <td key={c} className="text-center text-label-2">{t.linescores[c - 1] ?? '–'}</td>)}
              <td className="text-center font-bold">{t.score ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// Each row lists the ESPN category names to try (pre-game NBA uses per-game names).
const LEADER_ROWS = {
  nba: [[['points', 'pointsPerGame'], 'Points'], [['rebounds', 'reboundsPerGame'], 'Rebounds'], [['assists', 'assistsPerGame'], 'Assists']],
  nfl: [[['passingYards'], 'Passing'], [['rushingYards'], 'Rushing'], [['receivingYards'], 'Receiving'], [['sacks'], 'Sacks'], [['totalTackles'], 'Tackles']],
};
const pickCat = (cats, keys) => keys.map((k) => cats[k]).find(Boolean);

function GameLeaders({ g }) {
  const lg = useLeague();
  const by = Object.fromEntries(g.leaders.map((l) => [l.teamId, l.cats]));
  const A = by[g.away.id] ?? {};
  const H = by[g.home.id] ?? {};
  const rows = LEADER_ROWS[lg]
    .map(([keys, label]) => [keys[0], label, pickCat(A, keys), pickCat(H, keys)])
    .filter(([, , a, h]) => a || h);
  if (!rows.length) return null;
  const big = lg === 'nba';

  const Player = ({ p, right }) =>
    p ? (
      <Link to={`/${lg}/player/${p.id}`} className={`flex min-w-0 flex-1 items-center gap-2.5 ${right ? 'flex-row-reverse text-right' : ''}`}>
        <Headshot src={p.headshot} size={big ? 34 : 30} className="md:h-10 md:w-10" />
        <div className="min-w-0">
          {/* A long "J. Johnson" drops the initial on a phone rather than being cut off. */}
          <div className={`truncate font-semibold ${big ? 'text-[14px]' : 'text-[13px] md:text-[14px]'}`}>
            {p.name.length > (big ? 9 : 12) ? <><span className="md:hidden">{p.name.replace(/^\S+\.\s+/, '')}</span><span className="max-md:hidden">{p.name}</span></> : p.name}
          </div>
          {big ? (
            <div className="num font-display text-[18px] font-bold leading-tight md:text-[20px]">{p.value}</div>
          ) : (
            // Football lines are long ("19/31, 297 YDS, 2 TD"): let them take a second line.
            <div className="num text-[11.5px] leading-snug text-label-2 md:text-[12px]">{p.value}</div>
          )}
        </div>
      </Link>
    ) : (
      <div className="flex-1" />
    );

  return (
    <>
      <SectionTitle>{g.status.state === 'pre' ? 'Season Leaders' : 'Game Leaders'}</SectionTitle>
      <Card className="divide-y divide-sep">
        {rows.map(([k, label, a, h]) => (
          <div key={k} className={`flex items-center px-4 py-3 ${big ? 'gap-3' : 'gap-2 px-3.5'}`}>
            <Player p={a} />
            <div className="w-14 shrink-0 text-center text-[10.5px] font-semibold uppercase tracking-wide text-label-2 md:w-16 md:text-[11px]">{label}</div>
            <Player p={h} right />
          </div>
        ))}
      </Card>
    </>
  );
}

/** Athlete id -> injury status, for players listed on today's injury report. */
const InjuryCtx = createContext(null);

function InjuryTag({ id }) {
  const hurt = useContext(InjuryCtx)?.get(String(id));
  if (!hurt) return null;
  return <span className={`ml-1.5 font-bold ${/out|reserve|suspend/i.test(hurt) ? 'text-live' : 'text-[#806000] dark:text-[#ffd60a]'}`}>{/injured reserve/i.test(hurt) ? 'IR' : hurt}</span>;
}

// "Emmanuel McNeil-Warren" doesn't fit a phone column; "E. McNeil-Warren" does.
const fitName = (n = '') => (n.length > 16 ? n.replace(/^(\S)\S*\s+/, '$1. ') : n);

function PlayerCell({ a, lg, width = 'max-w-[124px]' }) {
  return (
    <Link to={`/${lg}/player/${a.id}`} className="flex items-center gap-2">
      <Headshot src={a.headshot} size={26} />
      <div className="min-w-0">
        <div className={`${width} truncate text-[13.5px] font-semibold leading-tight md:max-w-none`}><span className="md:hidden">{fitName(a.short)}</span><span className="max-md:hidden">{a.short}</span></div>
        <div className="text-[10.5px] leading-tight text-label-2">
          {[a.pos, a.jersey && `#${a.jersey}`].filter(Boolean).join(' · ')}
          <InjuryTag id={a.id} />
        </div>
      </div>
    </Link>
  );
}

function StatTable({ labels, groups, totals, lg, highlight }) {
  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="num w-full text-[13px]">
        <thead>
          <tr className="text-[11px] text-label-2">
            <th className="sticky left-0 z-10 bg-card py-1.5 pl-4 text-left font-semibold">Player</th>
            {labels.map((l, i) => <th key={i} className="px-2.5 font-semibold">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ title, list, key: gk, totals: own }, gi) =>
            list.length ? (
              [
                title && (
                  <tr key={`h-${gk ?? gi}`}>
                    <td colSpan={labels.length + 1} className="bg-card-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-label-2">
                      <span className="sticky left-0 inline-flex items-center gap-1.5 px-4">{title}</span>
                    </td>
                  </tr>
                ),
                ...list.map((a) => (
                  <tr key={`${gk ?? gi}-${a.id}`} className="border-t border-sep">
                    <td className="sticky left-0 z-10 bg-card py-1.5 pl-4 pr-3"><PlayerCell a={a} lg={lg} /></td>
                    {a.dnp && lg === 'nba' ? (
                      <td colSpan={labels.length} className="px-3 text-[12px] italic text-label-2">{a.reason ? titleCase(a.reason) : 'Did not play'}</td>
                    ) : (
                      a.stats.map((s, i) => (
                        <td key={i} className={`whitespace-nowrap px-2.5 text-center ${i === highlight ? 'font-bold' : 'text-label-2'}`}>
                          <WithPct label={labels[i]} v={s} />
                        </td>
                      ))
                    )}
                  </tr>
                )),
                own?.some(Boolean) && (
                  <tr key={`t-${gk ?? gi}`} className="border-t border-sep text-label-2">
                    <td className="sticky left-0 z-10 bg-card py-1.5 pl-4 text-[12px] font-semibold">Team</td>
                    {own.map((t, i) => <td key={i} className="whitespace-nowrap px-2.5 text-center"><WithPct label={labels[i]} v={t} /></td>)}
                  </tr>
                ),
              ]
            ) : null
          )}
          {totals?.some(Boolean) && (
            <tr className="border-t-2 border-sep font-semibold">
              <td className="sticky left-0 z-10 bg-card py-2.5 pl-4">Team</td>
              {totals.map((t, i) => <td key={i} className="whitespace-nowrap px-2.5 text-center"><WithPct label={labels[i]} v={t} /></td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- NBA box score: big numbers, one row per player ----------

// Shown in this order (the stats people look for first come first).
const NBA_ORDER = ['PTS', 'REB', 'AST', 'MIN', 'FG', '3PT', 'FT', 'STL', 'BLK', 'TO', '+/-', 'PF', 'OREB', 'DREB'];
const WIDE = new Set(['FG', '3PT', 'FT', 'MIN']);

function PlayerLines({ labels, groups, lg }) {
  const cols = NBA_ORDER.map((l) => [l, labels.indexOf(l)]).filter(([, i]) => i >= 0);
  const tone = (label, v) => {
    if (label !== '+/-') return '';
    const n = Number(v);
    return n > 0 ? 'text-win' : n < 0 ? 'text-live' : '';
  };
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="min-w-max">
        {groups.map(({ title, list, live, logo }) =>
          list.length ? (
            <div key={title}>
              <div className="flex items-center bg-card-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-label-2">
                <span className="sticky left-0 z-10 flex w-[132px] shrink-0 items-center gap-1.5 bg-card-2 pl-4 md:w-[190px]">
                  {live && <span className="live-dot h-[6px] w-[6px] rounded-full bg-live" />}
                  {logo && <TeamLogo abbr={logo} size={14} />}
                  {title}
                </span>
                {list.some((a) => !a.dnp) && cols.map(([label]) => (
                  <span key={label} className={`shrink-0 text-center text-[10px] normal-case tracking-normal text-label-3 ${WIDE.has(label) ? 'w-[52px]' : 'w-[42px]'}`}>{label}</span>
                ))}
              </div>
              {list.map((a) => (
                <div key={a.id} className="flex items-center border-t border-sep">
                  <Link to={`/${lg}/player/${a.id}`} className="sticky left-0 z-10 flex w-[132px] shrink-0 items-center gap-2 bg-card py-1.5 pl-3 pr-1.5 md:w-[190px]">
                    <Headshot src={a.headshot} size={26} />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-[13px] font-semibold leading-[1.15] [overflow-wrap:anywhere] md:text-[13.5px]">{a.short}</span>
                      <span className="block truncate text-[10.5px] text-label-2">
                        {[a.pos, a.jersey && `#${a.jersey}`].filter(Boolean).join(' · ')}
                        {a.starter && <span className="ml-1 rounded bg-fill px-1 text-[9.5px] font-bold text-label-2">S</span>}
                        <InjuryTag id={a.id} />
                      </span>
                    </span>
                  </Link>
                  {a.dnp ? (
                    <span className="px-3 text-[12px] italic text-label-2">{a.reason ? titleCase(a.reason) : 'Did not play'}</span>
                  ) : (
                    cols.map(([label, i]) => (
                      <span key={label} className={`num shrink-0 text-center ${WIDE.has(label) ? 'w-[52px]' : 'w-[42px]'}`}>
                        <span className={`block leading-none ${label === 'PTS' ? 'text-[16px] font-bold' : 'text-[14px] font-semibold'} ${tone(label, a.stats[i])}`}>
                          {label === '+/-' && Number(a.stats[i]) > 0 ? `+${Number(a.stats[i])}` : a.stats[i] ?? '–'}
                        </span>
                        {madePct(label, a.stats[i]) && <span className="mt-0.5 block text-[9.5px] leading-none text-label-3">{madePct(label, a.stats[i])}</span>}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

/** The team's own line: shooting with percentages, then the counting stats. */
function TeamLine({ team, labels, totals }) {
  const at = (l) => totals[labels.indexOf(l)];
  const shot = (l) => {
    const [m, n] = String(at(l) ?? '').split('-').map(Number);
    return Number.isFinite(m) && n > 0 ? { v: `${m}/${n}`, pct: `${((m / n) * 100).toFixed(1)}%` } : null;
  };
  const shots = [['FG', shot('FG')], ['3PT', shot('3PT')], ['FT', shot('FT')]].filter(([, s]) => s);
  const counts = ['REB', 'AST', 'STL', 'BLK', 'TO'].filter((l) => at(l) != null && at(l) !== '');
  if (!shots.length && !counts.length) return null;
  return (
    <Card className="mb-3 px-4 py-3">
      <div className="flex items-center gap-2 text-[14px] font-bold"><TeamLogo abbr={team.abbr} size={22} /> {team.name} totals</div>
      <div className="num mt-2.5 grid grid-cols-3 gap-2">
        {shots.map(([l, s]) => (
          <div key={l} className="rounded-xl bg-fill px-2 py-2 text-center">
            <div className="text-[17px] font-bold leading-none">{s.v}</div>
            <div className="mt-1 text-[11px] text-label-2">{l} · <span className="font-semibold text-label">{s.pct}</span></div>
          </div>
        ))}
      </div>
      {counts.length > 0 && (
        <div className="num mt-2.5 flex justify-between px-1">
          {counts.map((l) => (
            <div key={l} className="text-center">
              <div className="text-[16px] font-bold leading-none">{at(l)}</div>
              <div className="mt-1 text-[10px] font-medium text-label-3">{l}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Both teams' box scores on one screen, sharing one quarter picker. */
function Boxes({ g, focus }) {
  const lg = useLeague();
  const [period, setPeriod] = useState('game');
  const live = g.status.state === 'in';
  let periods;
  let livePeriod = null;
  if (lg === 'nfl') {
    const n = g.status.state === 'pre' ? 0 : Math.max(live ? 1 : 4, g.status.period || 0, ...g.drives.map((d) => d.period || 0));
    periods = Array.from({ length: n }, (_, i) => i + 1);
    livePeriod = live ? g.status.period : null;
  } else {
    periods = g.quarters?.periods ?? [];
    livePeriod = g.quarters?.livePeriod ?? null;
  }
  const sel = period !== 'game' && periods.includes(period) ? period : 'game';
  const awayRef = useRef(null);
  const homeRef = useRef(null);
  const refs = { away: awayRef, home: homeRef };
  // A link from a player (?tab=home) lands on that team's half.
  useEffect(() => {
    if (focus) refs[focus].current?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, g.id]);
  const jump = (side) => refs[side].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (lg === 'nfl') {
    return (
      <div>
        {periods.length > 0 && <PeriodChips periods={periods} sel={sel} onPick={setPeriod} live={livePeriod} />}
        <NflMatchup g={g} period={sel} />
      </div>
    );
  }
  return (
    <div>
      {periods.length > 0 && <PeriodChips periods={periods} sel={sel} onPick={setPeriod} live={livePeriod} />}
      <div className="lg:hidden"><NbaMatchup g={g} period={sel} /></div>
      <div className="max-lg:hidden space-y-5 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        {['away', 'home'].map((side) => {
          const t = g[side];
          const other = side === 'away' ? 'home' : 'away';
          return (
            <section key={side} ref={refs[side]} className="min-w-0 scroll-mt-16">
              <div className="mb-2 flex items-center gap-2 px-1">
                <TeamLogo abbr={t.abbr} size={22} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{t.name}</span>
                <button onClick={() => jump(other)} className="flex shrink-0 items-center gap-1 rounded-full bg-fill px-2 py-[3px] text-[11.5px] font-semibold text-label-2 active:opacity-60 lg:hidden">
                  <TeamLogo abbr={g[other].abbr} size={13} /> {g[other].abbr} {side === 'away' ? '↓' : '↑'}
                </button>
              </div>
              <BoxScore g={g} side={side} period={sel} />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoxScore({ g, side, period }) {
  const lg = useLeague();
  const team = g[side];
  const box = g.box.find((b) => b.teamId === team.id) ?? g.box[side === 'away' ? 0 : 1];

  const picker = null;
  if (!box) return <>{picker}<div className="py-10 text-center text-label-2">Box score not available yet.</div></>;

  if (lg === 'nfl') return <NflBox g={g} box={box} lg={lg} period={period} />;

  return (
    <div>
      {picker}
      <NbaBox g={g} box={box} lg={lg} team={team} period={period} />
    </div>
  );
}

function PeriodChips({ periods, sel, onPick, live }) {
  return (
    <div className="no-scrollbar -mx-3 mb-3 flex items-center gap-1.5 overflow-x-auto px-3 md:mx-0 md:px-0">
      {['game', ...periods].map((p) => (
        <button
          key={p}
          onClick={() => onPick(p)}
          className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition active:scale-95 ${
            sel === p ? 'bg-label text-bg' : 'bg-card text-label-2 hover:text-label'
          }`}
        >
          {p === 'game' ? 'Full Game' : periodName(p)}
          {p === live && <span className="live-dot ml-1.5 inline-block h-[6px] w-[6px] rounded-full bg-live align-middle" />}
        </button>
      ))}
    </div>
  );
}

/** One team's NFL stat groups for the full game or one quarter. */
function useNflGroups(g, box, period) {
  const [q, setQ] = useState(null);
  const [failed, setFailed] = useState(false);
  const live = g.status.state === 'in';
  const started = g.status.state !== 'pre';
  const count = started ? Math.max(live ? 1 : 4, g.status.period || 0, ...g.drives.map((d) => d.period || 0)) : 0;
  const periods = Array.from({ length: count }, (_, i) => i + 1);
  const sel = period !== 'game' && periods.includes(period) ? period : 'game';
  // Reload as plays come in during a live game.
  const playCount = g.drives.reduce((n, d) => n + d.plays.length, 0);
  const wanted = sel !== 'game';

  useEffect(() => {
    if (!wanted) return;
    let on = true;
    getNflQuarters(g.id, { fresh: live, ttl: 10 * 60_000 })
      .then((d) => { if (on) { setQ(d); setFailed(false); } })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [g.id, wanted, live, playCount]);

  const athletes = useMemo(() => {
    const seen = new Map();
    for (const gr of box?.groups ?? []) for (const a of gr.athletes) if (!seen.has(a.id)) seen.set(a.id, a);
    return [...seen.values()];
  }, [box]);

  let groups = box?.groups ?? [];
  let note = null;
  if (sel !== 'game') {
    if (!q) note = failed ? "Couldn't load quarter stats. Check your connection and try again." : 'loading';
    else if (!q.named) note = 'This game is too old for quarter stats. ESPN has no player-by-player record of its plays.';
    else {
      groups = nflQuarterGroups(q.stats[sel], athletes);
      if (!groups.length) note = `No stats for this team in ${periodName(sel)}${sel === q.livePeriod ? ' yet' : ''}.`;
    }
  }

  return { groups, note, q, sel };
}

function NflBox({ g, box, lg, period: ctl }) {
  const [own, setPeriod] = useState('game');
  const period = ctl ?? own;
  const live = g.status.state === 'in';
  const started = g.status.state !== 'pre';
  const count = started ? Math.max(live ? 1 : 4, g.status.period || 0, ...g.drives.map((d) => d.period || 0)) : 0;
  const periods = Array.from({ length: count }, (_, i) => i + 1);
  const { groups, note, q, sel } = useNflGroups(g, box, period);
  return (
    <div>
      {ctl === undefined && periods.length > 0 && <PeriodChips periods={periods} sel={sel} onPick={setPeriod} live={live ? g.status.period : null} />}
      {note === 'loading' ? (
        <div className="space-y-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-48" />
        </div>
      ) : note ? (
        <Card className="px-4 py-10 text-center text-[14px] text-label-2">{note}</Card>
      ) : (
        <div className="space-y-3">
          {groups.map((gr) => (
            <Card key={gr.key} className="overflow-hidden">
              <div className="px-4 pb-1 pt-3 text-[15px] font-bold">{gr.title}</div>
              <StatTable labels={gr.labels} groups={[{ list: gr.athletes }]} totals={gr.totals} lg={lg} highlight={gr.highlight ?? gr.labels.indexOf('YDS')} />
            </Card>
          ))}
        </div>
      )}
      {sel !== 'game' && !note && (
        <p className="mt-2 px-1 text-[11.5px] text-label-3">
          {sel === q.livePeriod ? `${periodName(sel)} in progress · ` : ''}Quarter stats are built from play-by-play. An unusual play (a fumble or a flag) can leave a line a yard or a tackle off the official count.
        </p>
      )}
    </div>
  );
}

/** NFL box score by stat group, both teams in the same card, so the two
 *  quarterbacks (or rushers, receivers…) sit right next to each other. */
function NflMatchup({ g, period }) {
  const lg = 'nfl';
  const boxOf = (side) => g.box.find((b) => b.teamId === g[side].id) ?? g.box[side === 'away' ? 0 : 1];
  const away = useNflGroups(g, boxOf('away'), period);
  const home = useNflGroups(g, boxOf('home'), period);
  if (!g.box.length) return <div className="py-10 text-center text-label-2">Box score not available yet.</div>;
  const note = away.note ?? home.note;
  if (note === 'loading') return <div className="space-y-3"><Skeleton className="h-36" /><Skeleton className="h-48" /></div>;
  if (note && !away.groups.length && !home.groups.length) return <Card className="px-4 py-10 text-center text-[14px] text-label-2">{note}</Card>;
  const keys = [];
  for (const gr of [...away.groups, ...home.groups]) if (!keys.includes(gr.key)) keys.push(gr.key);
  const head = (t) => <><TeamLogo abbr={t.abbr} size={14} />{t.abbr}</>;
  return (
    <div>
      <div className="space-y-3">
        {keys.map((k) => {
          const a = away.groups.find((x) => x.key === k);
          const h = home.groups.find((x) => x.key === k);
          const base = a ?? h;
          return (
            <Card key={k} className="overflow-hidden">
              <div className="px-4 pb-0.5 pt-2.5 text-[15px] font-bold">{base.title}</div>
              <StatTable
                labels={base.labels}
                lg={lg}
                highlight={base.highlight ?? base.labels.indexOf('YDS')}
                groups={[
                  { key: 'away', title: head(g.away), list: a?.athletes ?? [], totals: a?.athletes.length > 1 ? a.totals : null },
                  { key: 'home', title: head(g.home), list: h?.athletes ?? [], totals: h?.athletes.length > 1 ? h.totals : null },
                ]}
              />
            </Card>
          );
        })}
      </div>
      {period !== 'game' && away.q && (
        <p className="mt-2 px-1 text-[11.5px] text-label-3">
          {period === away.q.livePeriod ? `${periodName(period)} in progress · ` : ''}Quarter stats are built from play-by-play. An unusual play (a fumble or a flag) can leave a line a yard or a tackle off the official count.
        </p>
      )}
    </div>
  );
}

/** One NBA team's rows for the full game (on court / starters, bench, did not play) or one quarter. */
function nbaGroups(g, box, sel) {
  const q = g.quarters;
  let labels = box.labels;
  let totals = box.totals;
  let groups;
  if (sel === 'game') {
    // During a live game: who's on the floor right now, then everyone else.
    const on = new Set(g.status.state === 'in' && !g.stoppage?.label?.match(/^End of|Halftime/) ? q?.onCourt ?? [] : []);
    const mine = box.athletes.filter((a) => on.has(a.id));
    if (mine.length === 5) {
      groups = [
        { title: 'On court', live: true, list: mine },
        { title: 'Bench', list: box.athletes.filter((a) => !on.has(a.id) && !a.dnp) },
        { title: 'Did Not Play', list: box.athletes.filter((a) => !on.has(a.id) && a.dnp) },
      ];
    } else {
      groups = [
        { title: 'Starters', list: box.athletes.filter((a) => a.starter) },
        { title: 'Bench', list: box.athletes.filter((a) => !a.starter && !a.dnp) },
        { title: 'Did Not Play', list: box.athletes.filter((a) => !a.starter && a.dnp) },
      ];
    }
  } else {
    const st = q.stats[sel] ?? {};
    // Quarter rows use the engine's column order, which matches ESPN's box score.
    const rows = box.athletes
      .filter((a) => st[a.id] && (st[a.id].sec > 0 || st[a.id].active))
      .map((a) => ({ ...a, dnp: false, stats: formatLine(st[a.id]), sec: st[a.id].sec }))
      .sort((x, y) => y.sec - x.sec);
    const t = formatLine(sumLines(rows.map((a) => st[a.id])));
    t[0] = ''; // team minutes and +/- aren't meaningful as sums
    t[t.length - 1] = '';
    totals = t;
    groups = [
      { title: 'Started the game', list: rows.filter((a) => a.starter) },
      { title: 'Bench', list: rows.filter((a) => !a.starter) },
    ];
    if (!rows.length) groups = [];
  }
  return { labels, totals, groups };
}

/** Phones: each group (starters, bench…) holds both teams, so the two
 *  starting lineups sit one above the other. Wider screens keep two columns. */
function NbaMatchup({ g, period }) {
  const lg = 'nba';
  const sides = ['away', 'home'].map((side) => {
    const team = g[side];
    const box = g.box.find((b) => b.teamId === team.id) ?? g.box[side === 'away' ? 0 : 1];
    return box ? { side, team, ...nbaGroups(g, box, period) } : null;
  }).filter(Boolean);
  if (!sides.length) return <div className="py-10 text-center text-label-2">Box score not available yet.</div>;
  const titles = [];
  for (const s of sides) for (const gr of s.groups) if (!titles.includes(gr.title)) titles.push(gr.title);
  const labels = sides[0].labels;
  return (
    <div>
      <TeamTotals sides={sides} />
      {!titles.length && <Card className="py-10 text-center text-[14px] text-label-2">No stats for this quarter yet.</Card>}
      <div className="space-y-3">
        {titles.map((title) => {
          const live = sides.some((s) => s.groups.find((x) => x.title === title)?.live);
          const groups = sides.map((s) => ({
            title: s.team.abbr,
            logo: s.team.abbr,
            list: s.groups.find((x) => x.title === title)?.list ?? [],
          }));
          if (!groups.some((x) => x.list.length)) return null;
          return (
            <Card key={title} className="overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 pb-1 pt-2.5 text-[15px] font-bold">
                {live && <span className="live-dot h-[7px] w-[7px] rounded-full bg-live" />}
                {title}
              </div>
              <PlayerLines lg={lg} labels={labels} groups={groups} />
            </Card>
          );
        })}
      </div>
      {period !== 'game' && (
        <p className="mt-2 px-1 text-[11.5px] text-label-3">
          {period === g.quarters?.livePeriod ? `${periodName(period)} in progress · ` : ''}Quarter stats are built from play-by-play and match the official box score.
        </p>
      )}
    </div>
  );
}

/** Both teams' totals in one small table. */
function TeamTotals({ sides }) {
  const cols = ['FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO'];
  const rows = sides.map((s) => ({ s, at: (l) => s.totals?.[s.labels.indexOf(l)] }));
  const shown = cols.filter((l) => rows.some((r) => r.at(l) != null && r.at(l) !== ''));
  if (!shown.length) return null;
  const pct = (v) => {
    const [m, n] = String(v ?? '').split('-').map(Number);
    return Number.isFinite(m) && n > 0 ? `${Math.round((m / n) * 100)}%` : '';
  };
  return (
    <Card className="mb-3 overflow-hidden">
      <div className="no-scrollbar overflow-x-auto">
        <table className="num w-full whitespace-nowrap text-[13px]">
          <thead>
            <tr className="text-[10.5px] text-label-3">
              <th className="sticky left-0 bg-card py-1.5 pl-4 text-left font-semibold">Totals</th>
              {shown.map((l) => <th key={l} className="px-2 font-semibold">{l}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, at }) => (
              <tr key={s.side} className="border-t border-sep">
                <td className="sticky left-0 bg-card py-1.5 pl-4 pr-2 font-semibold"><span className="flex items-center gap-1.5"><TeamLogo abbr={s.team.abbr} size={16} />{s.team.abbr}</span></td>
                {shown.map((l) => (
                  <td key={l} className="px-2 text-center">
                    <span className="font-semibold">{at(l) ?? '–'}</span>
                    {pct(at(l)) && <span className="block text-[10px] leading-none text-label-3">{pct(at(l))}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NbaBox({ g, box, lg, team, period: ctl }) {
  const q = g.quarters;
  const [own, setPeriod] = useState('game');
  const period = ctl ?? own;
  const periods = q?.periods ?? [];
  const sel = period !== 'game' && periods.includes(period) ? period : 'game';

  const { labels, totals, groups } = nbaGroups(g, box, sel);

  return (
    <>
      {ctl === undefined && periods.length > 0 && (
        <div className="no-scrollbar -mx-3 mb-3 flex items-center gap-1.5 overflow-x-auto px-3 md:mx-0 md:px-0">
          {['game', ...periods].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition active:scale-95 ${
                sel === p ? 'bg-label text-bg' : 'bg-card text-label-2 hover:text-label'
              }`}
            >
              {p === 'game' ? 'Full Game' : periodName(p)}
              {p === q.livePeriod && <span className="live-dot ml-1.5 inline-block h-[6px] w-[6px] rounded-full bg-live align-middle" />}
            </button>
          ))}
        </div>
      )}
      {groups.length > 0 && <TeamLine team={team} labels={labels} totals={totals} />}
      <Card className="overflow-hidden">
        {groups.length ? (
          <PlayerLines lg={lg} labels={labels} groups={groups} />
        ) : (
          <div className="py-10 text-center text-[14px] text-label-2">No stats for this quarter yet.</div>
        )}
      </Card>
      {sel !== 'game' && (
        <p className="mt-2 px-1 text-[11.5px] text-label-3">
          {sel === q.livePeriod ? `${periodName(sel)} in progress · ` : ''}Quarter stats are built from play-by-play and match the official box score.
        </p>
      )}
    </>
  );
}

function TeamStats({ g }) {
  const { dark } = useTheme();
  const a = visibleColor(g.away.color, dark);
  const h = visibleColor(g.home.color, dark);
  if (!g.teamStats.length) return <div className="py-10 text-center text-label-2">Team stats not available yet.</div>;
  return (
    <Card className="px-4 py-2">
      <div className="flex items-center justify-between py-2 text-[13px] font-semibold">
        <span className="flex items-center gap-2"><TeamLogo abbr={g.away.abbr} size={22} />{g.away.abbr}</span>
        <span className="flex items-center gap-2">{g.home.abbr}<TeamLogo abbr={g.home.abbr} size={22} /></span>
      </div>
      {g.teamStats.map((r) => {
        const total = r.av + r.hv || 1;
        const awayBetter = r.higherIsBetter ? r.av > r.hv : r.av < r.hv;
        const homeBetter = r.higherIsBetter ? r.hv > r.av : r.hv < r.av;
        return (
          <div key={r.label} className="border-t border-sep py-2.5">
            <div className="flex items-center justify-between text-[14px]">
              <span className={`num w-16 ${awayBetter ? 'font-bold' : 'text-label-2'}`}>{r.away}</span>
              <span className="text-center text-[13px] text-label-2">{r.label}</span>
              <span className={`num w-16 text-right ${homeBetter ? 'font-bold' : 'text-label-2'}`}>{r.home}</span>
            </div>
            <div className="mt-1.5 flex h-[6px] gap-1">
              <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(r.av / total) * 100}%`, background: a, opacity: awayBetter ? 1 : 0.45 }} />
              </div>
              <div className="flex-1 overflow-hidden rounded-full bg-fill">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(r.hv / total) * 100}%`, background: h, opacity: homeBetter ? 1 : 0.45 }} />
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function PeriodPicker({ periods, period, setPeriod, scoringOnly, setScoringOnly, newest, setNewest }) {
  return (
    <>
    <div className="mb-2 flex items-center gap-2">
      <Segmented className="flex-1" value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: periodName(p) }))} />
      <button
        onClick={() => setScoringOnly((s) => !s)}
        className={`shrink-0 rounded-[10px] px-3 py-[7px] text-[13px] font-semibold transition ${scoringOnly ? 'bg-accent text-white' : 'bg-fill text-label-2'}`}
      >
        Scoring
      </button>
    </div>
    {setNewest && (
      <button onClick={() => setNewest((n) => !n)} className="mb-2 flex items-center gap-1 px-1 text-[12.5px] font-semibold text-accent active:opacity-60">
        <span className="text-[14px] leading-none">{newest ? '↑' : '↓'}</span>
        {newest ? 'Latest play first' : 'First play first'}
      </button>
    )}
    </>
  );
}

function usePeriods(list) {
  const periods = useMemo(() => [...new Set(list.map((p) => p.period))].filter(Boolean).sort((a, b) => a - b), [list]);
  const last = periods[periods.length - 1];
  const [period, setPeriod] = useState(last);
  useEffect(() => { if (!periods.includes(period)) setPeriod(last); }, [last, period, periods]);
  return { periods, period, setPeriod };
}

function Plays({ g }) {
  const { periods, period, setPeriod } = usePeriods(g.plays);
  const [scoringOnly, setScoringOnly] = useState(false);
  const [newest, setNewest] = useState(true);
  // A quarter has 100+ plays; show the first stretch and let the rest open on a tap.
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [period, scoringOnly, newest]);
  if (!g.plays.length) return <div className="py-10 text-center text-label-2">Play-by-play starts at tip-off.</div>;
  let list = g.plays.filter((p) => p.period === period && (!scoringOnly || p.scoring));
  // Same order live and after the game (it used to flip once the game ended).
  if (newest) list = [...list].reverse();
  const abbr = { [g.away.id]: g.away.abbr, [g.home.id]: g.home.abbr };
  return (
    <div>
      <PeriodPicker {...{ periods, period, setPeriod, scoringOnly, setScoringOnly, newest, setNewest }} />
      <Card className="divide-y divide-sep">
        {list.length === 0 && <div className="py-8 text-center text-[14px] text-label-2">No plays.</div>}
        {(more ? list : list.slice(0, 15)).map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="num w-11 shrink-0 text-[12px] text-label-2">{p.clock}</span>
            <div className="w-6 shrink-0">{abbr[p.teamId] && <TeamLogo abbr={abbr[p.teamId]} size={22} />}</div>
            <div className={`min-w-0 flex-1 text-[14px] leading-snug ${p.scoring ? 'font-semibold' : 'text-label-2'}`}>{p.text}</div>
            <div className={`num shrink-0 text-right text-[13px] ${p.scoring ? 'font-bold' : 'text-label-3'}`}>{p.away}–{p.home}</div>
          </div>
        ))}
        {!more && list.length > 15 && (
          <button onClick={() => setMore(true)} className="w-full py-2.5 text-center text-[14px] font-semibold text-accent active:opacity-60">
            Show all {list.length} plays
          </button>
        )}
      </Card>
    </div>
  );
}

function Drives({ g }) {
  const [scoringOnly, setScoringOnly] = useState(false);
  const [open, setOpen] = useState(g.currentDriveId);
  const live = g.status.state === 'in';

  if (scoringOnly || !g.drives.length) {
    const list = g.scoringPlays;
    return (
      <div>
        {g.drives.length > 0 && (
          <Segmented className="mb-3" value="scoring" onChange={(v) => setScoringOnly(v === 'scoring')} options={[{ value: 'all', label: 'All Drives' }, { value: 'scoring', label: 'Scoring Plays' }]} />
        )}
        <Card className="divide-y divide-sep">
          {list.length === 0 && <div className="py-8 text-center text-[14px] text-label-2">No scoring plays yet.</div>}
          {list.map((p) => (
            <div key={p.id} className="flex items-start gap-3 px-4 py-3">
              <TeamLogo abbr={p.abbr} size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-label-2">{p.type} · {periodName(p.period)} {p.clock}</div>
                <div className="mt-0.5 text-[14px] leading-snug">{p.text}</div>
              </div>
              <div className="num shrink-0 text-[14px] font-bold">{p.away}–{p.home}</div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  const list = [...g.drives].reverse(); // latest drive first, live and after the game
  return (
    <div>
      <Segmented className="mb-3" value="all" onChange={(v) => setScoringOnly(v === 'scoring')} options={[{ value: 'all', label: 'All Drives' }, { value: 'scoring', label: 'Scoring Plays' }]} />
      <Card className="divide-y divide-sep">
        {list.map((d) => {
          const isOpen = open === d.id;
          const current = d.id === g.currentDriveId;
          return (
            <div key={d.id}>
              <button onClick={() => setOpen(isOpen ? null : d.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fill/40">
                <TeamLogo abbr={d.abbr} size={26} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] ${d.isScore ? 'font-bold' : 'font-semibold'}`}>
                    {current && live ? <span className="text-live">Current Drive</span> : d.result || 'Drive'}
                  </div>
                  <div className="truncate text-[12px] text-label-2">
                    {periodName(d.period)} {d.clock} · {d.description}
                  </div>
                </div>
                {d.away != null && <div className={`num shrink-0 text-[13px] ${d.isScore ? 'font-bold' : 'text-label-3'}`}>{d.away}–{d.home}</div>}
                <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-label-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 5 7 7-7 7" /></svg>
              </button>
              {isOpen && (
                <div className="rise space-y-2 bg-card-2 px-4 py-3">
                  {d.plays.map((p) => (
                    <div key={p.id} className="flex gap-3 text-[13px]">
                      <span className="num w-20 shrink-0 text-label-2">{p.down || `${periodName(p.period)} ${p.clock}`}</span>
                      <span className={`min-w-0 flex-1 leading-snug ${p.scoring ? 'font-semibold' : 'text-label-2'}`}>{p.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** A round photo slot with initials, for people ESPN has no photo of (referees). */
function Initials({ name, size = 34 }) {
  const parts = name.split(/\s+/).filter(Boolean);
  const text = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-fill text-[12px] font-bold text-label-2" style={{ width: size, height: size }} aria-hidden>
      {text}
    </span>
  );
}

/** The game's referees (NBA: crew chief first; NFL: the full seven-person crew). */
function Officials({ g }) {
  const list = g.officials ?? [];
  if (!list.length) return null;
  const role = (o, i) => (g.league === 'nba' && i === 0 && /referee/i.test(o.role) ? 'Crew chief' : o.role);
  return (
    <>
      <SectionTitle>Officials</SectionTitle>
      <Card className="grid grid-cols-1 divide-y divide-sep sm:grid-cols-2 sm:divide-y-0">
        {list.map((o, i) => (
          <div key={`${o.name}${i}`} className="flex items-center gap-3 px-4 py-2.5 sm:border-b sm:border-sep">
            <Initials name={o.name} />
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-semibold">{o.name}</span>
              {o.role && <span className="block text-[12px] text-label-2">{role(o, i)}</span>}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

// Key season numbers for the head-to-head card, in this order.
const RANK_KEYS = {
  nba: ['offensive.avgPoints', 'opp.offensive.avgPoints', 'offensive.fieldGoalPct', 'offensive.threePointFieldGoalPct', 'general.avgRebounds', 'offensive.avgAssists', 'offensive.avgTurnovers', 'defensive.avgSteals', 'defensive.avgBlocks'],
  nfl: ['passing.totalPointsPerGame', 'opp.passing.totalPointsPerGame', 'passing.yardsPerGame', 'passing.passingYardsPerGame', 'rushing.rushingYardsPerGame', 'miscellaneous.thirdDownConvPct', 'miscellaneous.redzoneTouchdownPct', 'miscellaneous.turnOverDifferential', 'defensive.sacks'],
};

/** Both teams' season numbers side by side, each with its league rank. */
function SeasonRanks({ g }) {
  const lg = g.league;
  const [open, setOpen] = useState(null);
  // Only for this season's games: older games would show today's numbers.
  const recent = Math.abs(Date.now() - Date.parse(g.date)) < 45 * 864e5;
  const { data } = useData(
    () => (recent ? Promise.all([getTeamStats(lg, g.away.id), getTeamStats(lg, g.home.id)]) : Promise.resolve(null)),
    [lg, g.away.id, g.home.id, recent],
    { remember: `ranks:${lg}:${g.away.id}:${g.home.id}` }
  );
  if (!data) return null;
  const pick = (d) => Object.fromEntries(d.sections.flatMap((sec) => sec.rows).map((r) => [r.key, r]));
  const [a, h] = data.map(pick);
  const keys = RANK_KEYS[lg].filter((k) => a[k] && h[k]);
  if (!keys.length) return null;
  const rankNum = (r) => parseInt(String(r ?? '').replace(/\D/g, ''), 10) || 99;
  const Side = ({ r, right }) => (
    <span className={`num flex min-w-0 items-baseline gap-1.5 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <span className="text-[15px] font-semibold">{r.value}</span>
      {r.rank && <span className={`text-[11px] ${rankNum(r.rank) <= 5 ? 'font-semibold text-label' : 'text-label-3'}`}>{r.rank}</span>}
    </span>
  );
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-label-2">League rank</span>}>Season Ranks</SectionTitle>
      <Card className="divide-y divide-sep">
        <div className="flex items-center justify-between px-4 py-2 text-[13px] font-semibold">
          <span className="flex items-center gap-1.5"><TeamLogo abbr={g.away.abbr} size={18} />{g.away.abbr}</span>
          <span className="flex items-center gap-1.5">{g.home.abbr}<TeamLogo abbr={g.home.abbr} size={18} /></span>
        </div>
        {keys.map((k) => (
          <button key={k} disabled={!a[k].listed} onClick={() => setOpen({ key: k, label: a[k].label })} className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 text-left transition enabled:active:bg-fill">
            <Side r={a[k]} />
            <span className="flex items-center gap-0.5 text-center text-[12px] text-label-2">{a[k].label}{a[k].listed && <Icon.ChevronRight className="h-3 w-3 text-label-3" />}</span>
            <Side r={h[k]} right />
          </button>
        ))}
      </Card>
      {open && <RankSheet lg={lg} stat={open} mark={[g.away.id, g.home.id]} onClose={() => setOpen(null)} />}
    </>
  );
}

function GameInfo({ g }) {
  const rows = [
    ['Venue', g.venue],
    ['Location', g.city],
    ['Attendance', g.attendance ? Number(g.attendance).toLocaleString() : ''],
    ['Weather', g.weather],
    ['TV', g.broadcast],
    ['Start', g.date && new Date(g.date).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle>Game Info</SectionTitle>
      <Card className="divide-y divide-sep">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-[15px]">
            <span className="text-label-2">{k}</span>
            <span className="text-right">{v}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

function Actions({ g }) {
  const share = async () => {
    const url = gameUrl(g.league, g.id);
    const title = `${g.away.name} at ${g.home.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied', body: 'Send it to your friends.', ms: 2500 });
    } catch (e) {
      if (e?.name !== 'AbortError') toast({ title: "Couldn't share", body: url, ms: 5000 });
    }
  };
  const addToCalendar = () => {
    downloadICS(
      [{ id: g.id, league: g.league, date: g.date, title: `${g.away.name} at ${g.home.name}${g.broadcast ? ` (${g.broadcast})` : ''}`, location: [g.venue, g.city].filter(Boolean).join(', '), url: gameUrl(g.league, g.id) }],
      `${g.away.abbr}-at-${g.home.abbr}`,
      'NBA Tracker'
    );
  };
  const [every, setEvery] = useLiveFollow(g.league, g.id);
  const canFollow = liveFollowAvailable() && g.status.state !== 'post' && !g.status.postponed && every !== undefined;
  const follow = async (next) => {
    try {
      await setEvery(next);
      if (next && !every) toast({ title: 'Following live', body: g.status.state === 'pre' ? 'Score updates start at tip-off, in one notification that keeps updating.' : 'The score stays in one notification that keeps updating.', ms: 4000 });
    } catch (e) {
      toast(e.message === 'no-alerts'
        ? { title: 'Turn on alerts first', body: 'Tap here to open Settings, then switch on any alert.', href: '/settings', ms: 6000 }
        : { title: 'Couldn’t follow this game', body: e.message, ms: 5000 });
    }
  };
  return (
    <>
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <HeatBadge g={g} />
      <span className="flex-1" />
      {canFollow && (
        <button
          onClick={() => follow(every ? null : 20)}
          aria-pressed={!!every}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold active:scale-95 ${every ? 'bg-accent text-white' : 'bg-fill text-accent'}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${every ? 'bg-white' : 'bg-live'}`} />
          {every ? 'Following live' : 'Follow live'}
        </button>
      )}
      {g.status.state === 'pre' && g.timeValid && !g.status.postponed && (
        <button onClick={addToCalendar} aria-label="Add to calendar" title="Add to calendar" className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-accent active:scale-95">
          <Icon.CalendarPlus className="h-4 w-4" />
        </button>
      )}
      <button onClick={share} aria-label="Share" title="Share" className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-accent active:scale-95">
        <Icon.Share className="h-4 w-4" />
      </button>
    </div>
    {canFollow && every && (
      <div className="mt-2 flex items-center justify-end gap-2 text-[12.5px] text-label-2">
        Update
        <Segmented
          className="w-[250px]"
          options={[{ value: 20, label: 'Every score' }, { value: 60, label: 'Each minute' }, { value: 180, label: 'Every 3 min' }]}
          value={every}
          onChange={follow}
        />
      </div>
    )}
    </>
  );
}

function HiddenNotice({ onReveal }) {
  return (
    <Card className="mt-6 px-5 py-8 text-center">
      <div className="text-[16px] font-semibold">Spoiler-free mode is on</div>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-label-2">Box score, plays, highlights, and comments are hidden so you don’t see the result.</p>
      <button onClick={onReveal} className="mt-4 rounded-full bg-accent px-5 py-2 text-[14px] font-semibold text-white active:scale-95">
        Reveal everything
      </button>
    </Card>
  );
}

/** Buttons that jump to each part of the game page; sticks under the top bar
 *  and marks the part you're reading. */
function JumpBar({ sections, jumpTo }) {
  const [on, setOn] = useState(sections[0].id);
  const bar = useRef(null);
  const ids = sections.map((x) => x.id).join();
  useEffect(() => {
    const pick = () => {
      const line = (bar.current?.getBoundingClientRect().bottom ?? 100) + 12;
      let cur = sections[0].id;
      for (const { id } of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) cur = id;
      }
      // At the very bottom, the last part counts even if it's short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = sections.at(-1).id;
      setOn(cur);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => { window.removeEventListener('scroll', pick); window.removeEventListener('resize', pick); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  // Keep the current button in view on a narrow bar.
  useEffect(() => {
    // Only the bar scrolls sideways (scrollIntoView would also stop the page mid-scroll).
    const b = bar.current;
    const el = b?.querySelector(`[data-sec="${on}"]`);
    if (el) b.scrollLeft = el.offsetLeft - (b.clientWidth - el.offsetWidth) / 2;
  }, [on]);
  const target = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - ((bar.current?.getBoundingClientRect().bottom ?? 100) + 6));
  };
  const settle = useRef(0);
  const go = (id, smooth = true) => {
    const top = target(id);
    if (top == null) return;
    setOn(id);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    // Parts above can grow while their data loads; once the scroll stops, land exactly.
    const run = ++settle.current;
    let last = -1;
    let tries = 0;
    const stop = () => { settle.current++; };
    window.addEventListener('touchstart', stop, { once: true, passive: true });
    window.addEventListener('wheel', stop, { once: true, passive: true });
    const check = () => {
      if (run !== settle.current || ++tries > 20) return;
      if (Math.abs(window.scrollY - last) > 1) { last = window.scrollY; setTimeout(check, 120); return; }
      const want = target(id);
      if (want != null && Math.abs(want - window.scrollY) > 6) { window.scrollTo({ top: want, behavior: 'auto' }); last = -1; setTimeout(check, 200); }
    };
    setTimeout(check, 150);
  };
  useEffect(() => {
    if (!jumpTo.current) return;
    const id = jumpTo.current;
    jumpTo.current = null;
    requestAnimationFrame(() => go(id, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={bar}
      className="no-scrollbar sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-3 mt-3 flex gap-1.5 overflow-x-auto bg-bg/85 px-3 py-2 backdrop-blur-xl md:top-[calc(3.5rem+env(safe-area-inset-top))] md:-mx-4 md:px-4"
    >
      {sections.map((x) => (
        <button
          key={x.id}
          data-sec={x.id}
          onClick={() => go(x.id)}
          className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition active:scale-95 ${
            on === x.id ? 'bg-label text-bg' : 'bg-card text-label-2 hover:text-label'
          }`}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}

export default function Game() {
  const { id } = useParams();
  const lg = useLeague();
  // ?tab=away|home opens the box score on that team (used by player links).
  const [query] = useSearchParams();
  const asked = query.get('tab');
  // Opened from a link that points at a part of the game: scroll there once it's loaded.
  const jumpTo = useRef(asked === 'away' || asked === 'home' || asked === 'box' ? 'box' : asked === 'plays' ? 'plays' : null);
  // Only for the game the link pointed at, not the next one opened from the strip.
  const [focus] = useState(() => (asked === 'away' || asked === 'home' ? { id, side: asked } : null));
  const room = `${lg}:game:${id}`;
  // Going back from here, this game's score card is the one that pairs with the header.
  useEffect(() => { setMorph(id); }, [id]);
  const counts = useCommentCounts([room]);
  const spoilers = useSpoilers();
  const pushing = useRef(false);
  const { data: fetched, error, loading, reload, updatedAt } = useData((fresh) => getGame(lg, id, { fresh }), [lg, id], {
    pollMs: (d) => relaxed(gameDelay(d), pushing.current),
    remember: `game:${lg}:${id}`,
  });
  // Hopping between games keeps the last one on screen, dimmed, until the next arrives,
  // so the page never collapses to a loading skeleton and jumps.
  const last = useRef(null);
  if (fetched) last.current = fetched;
  const shown = fetched ?? (loading && last.current?.league === lg ? last.current : null);
  // Score and clock arrive by push, a second or so ahead of the full refresh.
  const g = useGamePush(lg, shown, reload, pushing);
  const stale = !fetched && !!g;
  const seed = !g && loading ? peekGame(lg, id) : null;
  const hide = g ? spoilers.hidden(g) : false;
  const reveal = () => g && spoilers.reveal(g);
  // ESPN's injury list is as of today, so it only belongs on a game that's on now or just ended.
  const injuriesNow = g?.preview?.injuries?.length > 0 && (g.status.state === 'in' || Date.now() - Date.parse(g.date) < 36 * 36e5);
  const hurt = useMemo(() => {
    if (!injuriesNow) return null;
    return new Map(g.preview.injuries.flatMap((t) => t.list.filter((p) => p.id).map((p) => [String(p.id), p.status])));
  }, [g, injuriesNow]);

  const comments = (
    <>
      <SectionTitle right={counts[room] ? <span className="text-[13px] text-label-2">{counts[room]}</span> : null}>Comments</SectionTitle>
      <Card className="overflow-hidden">
        <Comments key={room} room={room} />
      </Card>
    </>
  );
  const state = g?.status.state;
  // Pick'em is for upcoming and recent games, not ones from years ago.
  const pick = g && Date.now() - Date.parse(g.date) < 3 * 864e5 ? (
    <div className="mt-3">
      <GamePick g={g} />
    </div>
  ) : null;
  const sections = [
    { id: 'summary', label: 'Summary' },
    ...(g?.limited ? [] : [
      { id: 'box', label: 'Box score' },
      { id: 'team', label: 'Team stats' },
      { id: 'plays', label: lg === 'nfl' ? 'Drives' : 'Plays' },
      ...(lg === 'nba' ? [{ id: 'shots', label: 'Shots' }] : []),
    ]),
    { id: 'talk', label: 'Comments' },
  ];

  return (
    <div>
      <PullToRefresh onRefresh={reload} />
      <div className="flex items-start justify-between">
        <BackButton label="Scores" fallback={`/${lg}`} />
        {state === 'in' && !hide && !stale && <Freshness updatedAt={updatedAt} error={error} className="mt-1" />}
      </div>

      {loading && !g ? (
        // Opened from a score card: its teams and score fill the header at once.
        <div>
          {seed ? (
            <>
              <GameStrip g={seed} id={id} />
              <Hero g={seed} hide={spoilers.hidden(seed)} onReveal={() => spoilers.reveal(seed)} />
            </>
          ) : (
            <Skeleton className="h-[180px] !rounded-2xl" />
          )}
          <Skeleton className="mt-3 h-[110px] !rounded-2xl" />
          <Skeleton className="mt-3 h-[300px] !rounded-2xl" />
        </div>
      ) : error && !g ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="rise">
          <GameStrip g={g} id={id} />
          {/* Keyed by game: pickers and charts start fresh for each game, the chosen tab carries over. */}
          <div key={g.id} className={`transition-opacity duration-200 ${stale ? 'pointer-events-none opacity-40' : ''}`}>
          {g.round && (
            <div className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-wide text-accent">Playoffs · {g.round}</div>
          )}
          <Hero g={g} hide={hide} onReveal={reveal} />
          <Actions g={g} />
          {state !== 'post' && pick}
          {hide ? (
            <>
              <HiddenNotice onReveal={reveal} />
              <GameInfo g={g} />
            </>
          ) : (
            <>
              {g.stoppage && g.stoppage.label !== 'Halftime' && (
                <Card className={`mt-3 flex items-center gap-2.5 px-4 py-2.5 ${g.stoppage.kind === 'injury' ? 'ring-1 ring-live/50' : ''}`}>
                  <span className="text-[18px]">{g.stoppage.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-label-2">Play stopped</span>
                    <span className="block truncate text-[15px] font-semibold">{g.stoppage.label}</span>
                  </span>
                </Card>
              )}
              <Situation g={g} />
              <Linescore g={g} />
              {g.limited && (
                <p className="mt-3 px-1 text-[12.5px] leading-snug text-label-2">ESPN’s record of this game is incomplete, so the box score and plays aren’t available here.</p>
              )}
              {state === 'pre' && <Preview g={g} />}
              {state === 'pre' && <SeasonRanks g={g} />}

              {state !== 'pre' && (
                <>
                  <JumpBar sections={sections} jumpTo={jumpTo} />
                  <section id="summary" className="game-sec mt-3">
                    <StarPlayer g={g} />
                    <GameFlow g={g} />
                    <SeasonRanks g={g} />
                    {g.preview && <Series preview={g.preview} />}
                    {injuriesNow && <Injuries preview={g.preview} home={g.home} away={g.away} />}
                    <GameLeaders g={g} />
                  </section>
                  {!g.limited && (
                    <>
                      <section id="box" className="game-sec">
                        <SectionTitle>Box Score</SectionTitle>
                        <InjuryCtx.Provider value={hurt}>
                          <Boxes g={g} focus={focus?.id === id ? focus.side : null} />
                        </InjuryCtx.Provider>
                      </section>
                      <section id="team" className="game-sec">
                        <SectionTitle>Team Stats</SectionTitle>
                        <TeamStats g={g} />
                      </section>
                      <section id="plays" className="game-sec">
                        <SectionTitle>{lg === 'nfl' ? 'Drives' : 'Plays'}</SectionTitle>
                        {lg === 'nfl' ? <Drives g={g} /> : <Plays g={g} />}
                      </section>
                      {lg === 'nba' && (
                        <section id="shots" className="game-sec">
                          <SectionTitle>Shots</SectionTitle>
                          <ShotChart g={g} />
                        </section>
                      )}
                    </>
                  )}
                </>
              )}

              <Highlights videos={g.videos} />
              {state === 'post' && pick}

              <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <section id="talk" className="game-sec">{comments}</section>
                <div>
                  {state === 'pre' && <GameLeaders g={g} />}
                  <GameInfo g={g} />
                  <Officials g={g} />
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
