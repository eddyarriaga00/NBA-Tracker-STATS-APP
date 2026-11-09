import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getGame } from '../api/espn';
import Comments, { useCommentCounts } from '../components/Comments';
import Preview from '../components/Preview';
import WinProbability from '../components/WinProbability';
import { BackButton, Card, ErrorState, Headshot, LiveBadge, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';
import { formatLine, sumLines } from '../lib/quarterStats';

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

function Hero({ g }) {
  const { dark } = useTheme();
  const lg = useLeague();
  const { status, home, away } = g;
  const final = status.state === 'post';
  const pre = status.state === 'pre';
  const a = visibleColor(away.color, dark);
  const h = visibleColor(home.color, dark);

  const Side = ({ t }) => (
    <Link
      to={t.tbd ? '#' : `/${lg}/team/${t.id}`}
      onClick={(e) => t.tbd && e.preventDefault()}
      className="flex min-w-0 flex-1 flex-col items-center gap-1.5 transition active:scale-95"
    >
      <TeamLogo abbr={t.abbr} size={48} className="drop-shadow-sm md:h-20 md:w-20" />
      <div className="text-center">
        <div className="text-[14px] font-semibold leading-tight md:text-[17px]">{t.name}</div>
        <div className="num text-[12px] text-label-2">{t.record}</div>
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

function Situation({ g }) {
  const s = g.situation;
  if (g.status.state !== 'in' || !s || (!s.downDistance && !s.lastPlay)) return null;
  const team = s.possession === g.home.id ? g.home : s.possession === g.away.id ? g.away : null;
  return (
    <Card className={`mt-3 px-4 py-3 ${s.redZone ? 'ring-2 ring-live/60' : ''}`}>
      <div className="flex items-center gap-2.5">
        {team && <TeamLogo abbr={team.abbr} size={26} />}
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">
            {s.full || s.downDistance || <span className="text-[12px] uppercase tracking-wide text-label-2">Last play</span>}
            {s.redZone && <span className="ml-2 rounded-full bg-live px-2 py-0.5 text-[11px] font-bold text-white">RED ZONE</span>}
          </div>
          {s.lastPlay && <div className="mt-0.5 text-[13px] text-label-2">{s.lastPlay}</div>}
        </div>
      </div>
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

function BoxScore({ g }) {
  const lg = useLeague();
  const [side, setSide] = useState('away');
  const team = g[side];
  const box = g.box.find((b) => b.teamId === team.id) ?? g.box[side === 'away' ? 0 : 1];

  const picker = (
    <Segmented
      className="mb-3"
      value={side}
      onChange={setSide}
      options={[{ value: 'away', label: g.away.name }, { value: 'home', label: g.home.name }]}
    />
  );
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
      <NbaBox g={g} box={box} lg={lg} />
    </div>
  );
}

function NbaBox({ g, box, lg }) {
  const q = g.quarters;
  const [period, setPeriod] = useState('game');
  const periods = q?.periods ?? [];
  const sel = period !== 'game' && periods.includes(period) ? period : 'game';

  let labels = box.labels;
  let totals = box.totals;
  let groups;
  if (sel === 'game') {
    groups = [
      { title: 'Starters', list: box.athletes.filter((a) => a.starter) },
      { title: 'Bench', list: box.athletes.filter((a) => !a.starter && !a.dnp) },
      { title: 'Did Not Play', list: box.athletes.filter((a) => !a.starter && a.dnp) },
    ];
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
      <Card className="overflow-hidden">
        {groups.length ? (
          <StatTable lg={lg} labels={labels} totals={totals} highlight={labels.indexOf('PTS')} groups={groups} />
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

export default function Game() {
  const { id } = useParams();
  const lg = useLeague();
  const [tab, setTab] = useState('box');
  const room = `${lg}:game:${id}`;
  const counts = useCommentCounts([room]);
  const { data: g, error, loading, reload } = useData((fresh) => getGame(lg, id, { fresh }), [lg, id], {
    pollMs: 15_000,
    shouldPoll: (d) => d.status.state === 'in',
  });

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
      <BackButton label="Scores" fallback={`/${lg}`} />

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
          <Hero g={g} />
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
                  { value: 'box', label: 'Box Score' },
                  { value: 'team', label: 'Team Stats' },
                  { value: 'plays', label: lg === 'nfl' ? 'Drives' : 'Plays' },
                ]}
              />
              <div className="mt-3">
                {tab === 'box' && <BoxScore g={g} />}
                {tab === 'team' && <TeamStats g={g} />}
                {tab === 'plays' && (lg === 'nfl' ? <Drives g={g} /> : <Plays g={g} />)}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <div>{comments}</div>
            <div>
              <GameLeaders g={g} />
              <GameInfo g={g} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
