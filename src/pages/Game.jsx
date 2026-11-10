import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGame, teamHref } from '../api/espn';
import Comments, { useCommentCounts } from '../components/Comments';
import Preview from '../components/Preview';
import Highlights from '../components/Highlights';
import ShotChart from '../components/ShotChart';
import { HeatBadge } from '../components/GameCard';
import { Icon } from '../components/icons';
import { downloadICS, gameUrl } from '../lib/calendar';
import { useSpoilers } from '../lib/settings';
import { toast } from '../lib/toast';
import WinProbability from '../components/WinProbability';
import { GamePick } from '../components/Picks';
import FootballField from '../components/FootballField';
import GameStrip from '../components/GameStrip';
import LeadTracker from '../components/LeadTracker';
import { BackButton, Card, ErrorState, Headshot, LiveBadge, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';
import { gameDelay } from '../lib/livePolling';
import Freshness from '../components/Freshness';
import { formatLine, sumLines } from '../lib/quarterStats';
import { liveFollowAvailable, useLiveFollow } from '../lib/liveFollow';

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function Hero({ g, hide, onReveal }) {
  const { dark } = useTheme();
  const lg = useLeague();
  const { status, home, away } = g;
  const final = status.state === 'post';
  const pre = status.state === 'pre';
  const a = visibleColor(away.color, dark, away.alt);
  const h = visibleColor(home.color, dark, home.alt);

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

  const Score = ({ t }) => (
    <span
      key={status.state === 'in' ? t.score : undefined}
      className={`num font-display text-[36px] font-bold leading-none tracking-tight md:text-[56px] ${
        final && !t.winner ? 'text-label-3' : ''
      } ${status.state === 'in' ? 'score-flash' : ''}`}
    >
      {t.score ?? 0}
    </span>
  );

  return (
    <Card className="relative overflow-hidden">
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
          ) : hide ? (
            <>
              <div className="text-[13px] font-semibold text-label-2">Score hidden</div>
              <button onClick={onReveal} className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white active:scale-95">
                Reveal
              </button>
              {status.state === 'in' ? <LiveBadge label={status.label} /> : <span className="text-[12px] text-label-2">{status.state === 'post' ? 'Final' : status.label}</span>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 md:gap-6">
                <Score t={away} />
                <span className="text-[18px] text-label-3">–</span>
                <Score t={home} />
              </div>
              {status.state === 'in' ? <LiveBadge label={status.label} /> : <span className="text-[13px] font-semibold text-label-2">{status.label}</span>}
            </>
          )}
        </div>
        <Side t={home} />
      </div>
    </Card>
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
  if (!n) return null;
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
        <Headshot src={p.headshot} size={34} className="md:h-10 md:w-10" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">{p.name}</div>
          {big ? (
            <div className="num font-display text-[18px] font-bold leading-tight md:text-[20px]">{p.value}</div>
          ) : (
            <div className="truncate text-[12px] text-label-2 num">{p.value}</div>
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
          <div key={k} className="flex items-center gap-3 px-4 py-3">
            <Player p={a} />
            <div className="w-14 shrink-0 text-center text-[10.5px] font-semibold uppercase tracking-wide text-label-2 md:w-16 md:text-[11px]">{label}</div>
            <Player p={h} right />
          </div>
        ))}
      </Card>
    </>
  );
}

function PlayerCell({ a, lg, width = 'max-w-[124px]' }) {
  return (
    <Link to={`/${lg}/player/${a.id}`} className="flex items-center gap-2.5">
      <Headshot src={a.headshot} size={30} />
      <div className="min-w-0">
        <div className={`${width} truncate text-[14px] font-semibold md:max-w-none`}>{a.short}</div>
        <div className="text-[11px] text-label-2">{[a.pos, a.jersey && `#${a.jersey}`].filter(Boolean).join(' · ')}</div>
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
            <th className="sticky left-0 z-10 bg-card py-2.5 pl-4 text-left font-semibold">Player</th>
            {labels.map((l, i) => <th key={i} className="px-2.5 font-semibold">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ title, list }) =>
            list.length ? (
              [
                title && (
                  <tr key={`h-${title}`}>
                    <td colSpan={labels.length + 1} className="sticky left-0 bg-card-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-label-2">
                      {title}
                    </td>
                  </tr>
                ),
                ...list.map((a) => (
                  <tr key={a.id} className="border-t border-sep">
                    <td className="sticky left-0 z-10 bg-card py-2 pl-4 pr-3"><PlayerCell a={a} lg={lg} /></td>
                    {a.dnp && lg === 'nba' ? (
                      <td colSpan={labels.length} className="px-3 text-[12px] italic text-label-2">{a.reason ? titleCase(a.reason) : 'Did not play'}</td>
                    ) : (
                      a.stats.map((s, i) => (
                        <td key={i} className={`whitespace-nowrap px-2.5 text-center ${i === highlight ? 'font-bold' : 'text-label-2'}`}>{s}</td>
                      ))
                    )}
                  </tr>
                )),
              ]
            ) : null
          )}
          {totals?.some(Boolean) && (
            <tr className="border-t-2 border-sep font-semibold">
              <td className="sticky left-0 z-10 bg-card py-2.5 pl-4">Team</td>
              {totals.map((t, i) => <td key={i} className="whitespace-nowrap px-2.5 text-center">{t}</td>)}
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
        {groups.map(({ title, list, live }) =>
          list.length ? (
            <div key={title}>
              <div className="sticky left-0 flex w-screen max-w-full items-center gap-1.5 bg-card-2 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-label-2">
                {live && <span className="live-dot h-[6px] w-[6px] rounded-full bg-live" />}
                {title}
              </div>
              {list.map((a) => (
                <div key={a.id} className="flex items-center border-t border-sep">
                  <Link to={`/${lg}/player/${a.id}`} className="sticky left-0 z-10 flex w-[132px] shrink-0 items-center gap-2 bg-card py-2 pl-3 pr-1.5 md:w-[190px]">
                    <Headshot src={a.headshot} size={34} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold leading-tight">{a.short}</span>
                      <span className="block truncate text-[10.5px] text-label-2">
                        {[a.pos, a.jersey && `#${a.jersey}`].filter(Boolean).join(' · ')}
                        {a.starter && <span className="ml-1 rounded bg-fill px-1 text-[9.5px] font-bold text-label-2">S</span>}
                      </span>
                    </span>
                  </Link>
                  {a.dnp ? (
                    <span className="px-3 text-[12px] italic text-label-2">{a.reason ? titleCase(a.reason) : 'Did not play'}</span>
                  ) : (
                    cols.map(([label, i]) => (
                      <span key={label} className={`num shrink-0 py-2 text-center ${WIDE.has(label) ? 'w-[52px]' : 'w-[42px]'}`}>
                        <span className={`block leading-none ${label === 'PTS' ? 'text-[18px] font-bold' : 'text-[15.5px] font-semibold'} ${tone(label, a.stats[i])}`}>
                          {label === '+/-' && Number(a.stats[i]) > 0 ? `+${Number(a.stats[i])}` : a.stats[i] ?? '–'}
                        </span>
                        <span className="mt-1 block text-[9.5px] font-medium text-label-3">{label}</span>
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

function BoxScore({ g, side }) {
  const lg = useLeague();
  const team = g[side];
  const box = g.box.find((b) => b.teamId === team.id) ?? g.box[side === 'away' ? 0 : 1];

  const picker = null;
  if (!box) return <>{picker}<div className="py-10 text-center text-label-2">Box score not available yet.</div></>;

  if (lg === 'nfl') {
    return (
      <div>
        {picker}
        <div className="space-y-3">
          {box.groups.map((gr) => (
            <Card key={gr.key} className="overflow-hidden">
              <div className="px-4 pb-1 pt-3 text-[15px] font-bold">{gr.title}</div>
              <StatTable labels={gr.labels} groups={[{ list: gr.athletes }]} totals={gr.totals} lg={lg} highlight={gr.labels.indexOf('YDS')} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {picker}
      <NbaBox g={g} box={box} lg={lg} team={team} />
    </div>
  );
}

function NbaBox({ g, box, lg, team }) {
  const q = g.quarters;
  const [period, setPeriod] = useState('game');
  const periods = q?.periods ?? [];
  const sel = period !== 'game' && periods.includes(period) ? period : 'game';

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

  return (
    <>
      {periods.length > 0 && (
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

function PeriodPicker({ periods, period, setPeriod, scoringOnly, setScoringOnly }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Segmented className="flex-1" value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: periodName(p) }))} />
      <button
        onClick={() => setScoringOnly((s) => !s)}
        className={`shrink-0 rounded-[10px] px-3 py-[7px] text-[13px] font-semibold transition ${scoringOnly ? 'bg-accent text-white' : 'bg-fill text-label-2'}`}
      >
        Scoring
      </button>
    </div>
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
  if (!g.plays.length) return <div className="py-10 text-center text-label-2">Play-by-play starts at tip-off.</div>;
  let list = g.plays.filter((p) => p.period === period && (!scoringOnly || p.scoring));
  if (g.status.state === 'in') list = [...list].reverse();
  const abbr = { [g.away.id]: g.away.abbr, [g.home.id]: g.home.abbr };
  return (
    <div>
      <PeriodPicker {...{ periods, period, setPeriod, scoringOnly, setScoringOnly }} />
      <Card className="divide-y divide-sep">
        {list.length === 0 && <div className="py-8 text-center text-[14px] text-label-2">No plays.</div>}
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="num w-11 shrink-0 text-[12px] text-label-2">{p.clock}</span>
            <div className="w-6 shrink-0">{abbr[p.teamId] && <TeamLogo abbr={abbr[p.teamId]} size={22} />}</div>
            <div className={`min-w-0 flex-1 text-[14px] leading-snug ${p.scoring ? 'font-semibold' : 'text-label-2'}`}>{p.text}</div>
            <div className={`num shrink-0 text-right text-[13px] ${p.scoring ? 'font-bold' : 'text-label-3'}`}>{p.away}–{p.home}</div>
          </div>
        ))}
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

  const list = live ? [...g.drives].reverse() : g.drives;
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
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <HeatBadge g={g} />
      <span className="flex-1" />
      {canFollow && (
        <button
          onClick={() => follow(every ? null : 20)}
          aria-pressed={!!every}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold active:scale-95 ${every ? 'bg-accent text-white' : 'bg-fill text-accent'}`}
        >
          <span className={`h-2 w-2 rounded-full ${every ? 'bg-white' : 'bg-live'}`} />
          {every ? 'Following live' : 'Follow live'}
        </button>
      )}
      {g.status.state === 'pre' && g.timeValid && !g.status.postponed && (
        <button onClick={addToCalendar} className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-accent active:scale-95">
          <Icon.CalendarPlus className="h-4 w-4" /> Add to Calendar
        </button>
      )}
      <button onClick={share} className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold text-accent active:scale-95">
        <Icon.Share className="h-4 w-4" /> Share
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

export default function Game() {
  const { id } = useParams();
  const lg = useLeague();
  const [tab, setTab] = useState('game');
  const room = `${lg}:game:${id}`;
  const counts = useCommentCounts([room]);
  const spoilers = useSpoilers();
  const { data: g, error, loading, reload, updatedAt } = useData((fresh) => getGame(lg, id, { fresh }), [lg, id], {
    pollMs: gameDelay,
  });
  const hide = g ? spoilers.hidden(g) : false;
  const reveal = () => g && spoilers.reveal(g);

  const comments = (
    <>
      <SectionTitle right={counts[room] ? <span className="text-[13px] text-label-2">{counts[room]}</span> : null}>Comments</SectionTitle>
      <Card className="overflow-hidden">
        <Comments room={room} />
      </Card>
    </>
  );

  return (
    <div>
      <div className="flex items-start justify-between">
        <BackButton label="Scores" fallback={`/${lg}`} />
        {g?.status.state === 'in' && !hide && <Freshness updatedAt={updatedAt} error={error} className="mt-1" />}
      </div>

      {loading && !g ? (
        <div className="space-y-3">
          <Skeleton className="h-[180px] !rounded-2xl" />
          <Skeleton className="h-[110px] !rounded-2xl" />
          <Skeleton className="h-[300px] !rounded-2xl" />
        </div>
      ) : error && !g ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="rise">
          {g.round && (
            <div className="mb-2 px-1 text-[12.5px] font-semibold uppercase tracking-wide text-accent">Playoffs · {g.round}</div>
          )}
          <GameStrip g={g} />
          <Hero g={g} hide={hide} onReveal={reveal} />
          <Actions g={g} />
          {/* Pick'em is for upcoming and recent games, not ones from years ago. */}
          {Date.now() - Date.parse(g.date) < 3 * 864e5 && (
            <div className="mt-3">
              <GamePick g={g} />
            </div>
          )}
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
              {g.status.state !== 'pre' && g.winProb && (
                <WinProbability wp={g.winProb} home={g.home} away={g.away} live={g.status.state === 'in'} />
              )}
              {g.status.state === 'pre' && <Preview g={g} />}

              {g.status.state !== 'pre' && (
                <>
                  <Segmented
                    className="mt-6"
                    value={tab}
                    onChange={setTab}
                    options={[
                      { value: 'game', label: 'Game' },
                      { value: 'away', label: g.away.abbr },
                      { value: 'home', label: g.home.abbr },
                      { value: 'plays', label: lg === 'nfl' ? 'Drives' : 'Plays' },
                      ...(lg === 'nba' ? [{ value: 'shots', label: 'Shots' }] : []),
                    ]}
                  />
                  <div className="mt-3">
                    {tab === 'game' && (
                      <>
                        <LeadTracker g={g} />
                        <SectionTitle>Team Stats</SectionTitle>
                        <TeamStats g={g} />
                      </>
                    )}
                    {(tab === 'away' || tab === 'home') && <BoxScore g={g} side={tab} />}
                    {tab === 'plays' && (lg === 'nfl' ? <Drives g={g} /> : <Plays g={g} />)}
                    {tab === 'shots' && lg === 'nba' && <ShotChart g={g} />}
                  </div>
                </>
              )}

              <Highlights videos={g.videos} />

              <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <div>{comments}</div>
                <div>
                  <GameLeaders g={g} />
                  <GameInfo g={g} />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
