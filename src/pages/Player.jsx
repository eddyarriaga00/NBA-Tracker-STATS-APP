import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { currentSeason, firstSeason, getCareerGames, getGamelog, getPlayer, seasonLabel } from '../api/espn';
import { Icon } from '../components/icons';
import { BioButton } from '../components/BioSheet';
import { BackButton, Card, Chips, ErrorState, SeasonPicker, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function Hero({ bio, lg }) {
  const { dark } = useTheme();
  const c = visibleColor(bio.team?.color ?? '#8e8e93', dark);
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 140% at 100% 100%, ${c}55 0%, ${c}18 45%, transparent 70%)` }} />
      {bio.headshot && (
        <img src={bio.headshot} alt="" className="pointer-events-none absolute bottom-0 right-[-16px] h-[160px] w-auto object-contain object-bottom md:right-4 md:h-[250px]" />
      )}
      <div className="relative min-h-[170px] p-4 md:min-h-[250px] md:p-7">
        <div className="max-w-[60%]">
          <div className="text-[13px] text-label-2 md:text-[15px]">{bio.first}</div>
          <h1 className="font-display text-[26px] font-bold leading-[1.05] tracking-tight [overflow-wrap:anywhere] md:text-[44px]">{bio.last}</h1>
          <div className="mt-1.5 text-[13px] text-label-2 md:mt-2 md:text-[14px]">
            {[bio.jersey && `#${bio.jersey}`, bio.position].filter(Boolean).join(' · ')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {bio.team && (
              <Link to={`/${lg}/team/${bio.team.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold transition hover:bg-fill-strong">
                <TeamLogo abbr={bio.team.abbr} size={18} />
                {bio.team.name}
              </Link>
            )}
            <BioButton lg={lg} id={bio.id} className="!py-1.5 !text-[13px]" />
            <Link
              to={`/${lg}/compare?a=${bio.id}`}
              className="shrink-0 rounded-full bg-fill px-2.5 py-1.5 text-[13px] font-semibold text-accent transition hover:bg-fill-strong active:scale-95"
            >
              Compare
            </Link>
          </div>
          {bio.injury && (
            <div className="mt-2">
              <span className="rounded-full bg-live/12 px-2.5 py-1 text-[12px] font-bold text-live">{bio.injury}</span>
            </div>
          )}
          {!bio.active && <div className="mt-2 text-[12px] font-semibold text-label-2">Inactive</div>}
        </div>
      </div>
    </Card>
  );
}

// Which Leaders list each "This Season" tile opens. Stats without a leaders
// list (yards per catch, interceptions thrown…) open the game log instead.
const TILE_TO_LEADERS = {
  nba: {
    avgPoints: 'pointsPerGame',
    avgRebounds: 'reboundsPerGame',
    avgAssists: 'assistsPerGame',
    avgSteals: 'stealsPerGame',
    avgBlocks: 'blocksPerGame',
    fieldGoalPct: 'fieldGoalPercentage',
    threePointFieldGoalPct: '3PointPct',
    freeThrowPct: 'FreeThrowPct',
  },
  nfl: {
    passingYards: 'passingYards',
    passingTouchdowns: 'passingTouchdowns',
    QBRating: 'quarterbackRating',
    adjQBR: 'quarterbackRating',
    rushingYards: 'rushingYards',
    rushingTouchdowns: 'rushingTouchdowns',
    receivingYards: 'receivingYards',
    receptions: 'receptions',
    receivingTouchdowns: 'receivingTouchdowns',
    sacks: 'sacks',
    totalTackles: 'totalTackles',
  },
};

function SummaryTiles({ bio, lg, id, onGameLog }) {
  if (!bio.summary.length) return null;
  const passer = bio.summary.some((s) => s.stat === 'passingYards'); // a QB's INT means thrown, not caught
  const target = (s) => {
    if (lg === 'nfl' && s.stat === 'interceptions' && !passer) return 'interceptions';
    return TILE_TO_LEADERS[lg][s.stat] ?? null;
  };
  const inner = (s, cat) => (
    <>
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-label-2 md:text-[12px]">
        {s.label}
        <Icon.ChevronRight className="h-3.5 w-3.5 text-label-3" />
      </div>
      <div className="num mt-1 font-display text-[24px] font-bold leading-none tracking-tight md:text-[30px]">{s.value}</div>
      <div className="mt-1 text-[11px] text-label-2 md:mt-1.5 md:text-[12px]">
        {s.rank ? `${s.rank} in ${lg.toUpperCase()}` : cat ? 'See leaders' : 'See game log'}
      </div>
    </>
  );
  const cls = 'block rounded-2xl bg-card px-3.5 py-2.5 text-left transition hover:bg-fill/40 active:scale-[0.98] md:px-4 md:py-3';
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-label-2">{bio.summaryTitle}</span>}>This Season</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        {bio.summary.map((s) => {
          const cat = target(s);
          return cat ? (
            <Link key={s.label} to={`/${lg}/leaders?cat=${encodeURIComponent(cat)}&hl=${id}&name=${encodeURIComponent(bio.name ?? '')}${s.rank ? `&rank=${encodeURIComponent(s.rank)}` : ''}`} className={cls}>
              {inner(s, cat)}
            </Link>
          ) : (
            <button key={s.label} onClick={onGameLog} className={cls}>
              {inner(s, null)}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Facts({ bio }) {
  if (!bio.facts.length) return null;
  return (
    <>
      <SectionTitle>Bio</SectionTitle>
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-sep md:grid-cols-4">
        {bio.facts.map(([k, v]) => (
          <div key={k} className="bg-card px-3.5 py-2.5 md:px-4 md:py-3">
            <div className="text-[12px] text-label-2">{k}</div>
            <div className="mt-0.5 text-[14px] font-semibold md:text-[15px]">{v}</div>
          </div>
        ))}
      </Card>
    </>
  );
}

function SimpleTable({ head, rows, first = 'Season', sticky = true }) {
  return (
    <div className="no-scrollbar overflow-x-auto">
      <table className="num w-full whitespace-nowrap text-[13px]">
        <thead>
          <tr className="border-b border-sep text-[11px] font-semibold text-label-2">
            <th className={`${sticky ? 'sticky left-0 z-10' : ''} bg-card py-2.5 pl-4 pr-3 text-left`}>{first}</th>
            {head.map((h, i) => <th key={i} className="px-2.5 text-center last:pr-4">{h}</th>)}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

/** Game log with a season picker; the current season comes with the player page. */
function SeasonGameLog({ initial, lg, id }) {
  const cur = currentSeason(lg);
  const [season, setSeason] = useState(cur);
  const seasons = (initial?.seasons?.length ? initial.seasons : [cur, cur - 1, cur - 2]).filter((y) => y <= cur);
  const opts = [...new Set([cur, ...seasons])].sort((a, b) => b - a).map((y) => ({ value: y, label: seasonLabel(lg, y) }));
  const { data, error, loading, reload } = useData(
    (fresh) => (season === cur && initial ? Promise.resolve(initial) : getGamelog(lg, id, season, { fresh })),
    [lg, id, season]
  );
  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[13px] text-label-2">{data ? `${data.rows.length} games` : ' '}</span>
        <SeasonPicker options={opts} value={season} onChange={setSeason} />
      </div>
      {loading && !data ? (
        <Skeleton className="h-[300px] !rounded-2xl" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : data ? (
        <GameLog key={season} log={data} lg={lg} />
      ) : (
        <Card className="py-10 text-center text-label-2">No game log for this season.</Card>
      )}
    </div>
  );
}

function GameLog({ log, lg }) {
  const options = log.labels.map((l, i) => ({ value: i, label: l }));
  const defaultIdx = Math.max(0, log.labels.indexOf(lg === 'nba' ? 'PTS' : 'YDS'));
  const [stat, setStat] = useState(defaultIdx);
  const [limit, setLimit] = useState(15);
  const go = useNavigate();
  // The picked stat leads the table, so it's on screen without scrolling sideways.
  const order = [stat, ...log.labels.map((_, i) => i).filter((i) => i !== stat)];

  const chart = useMemo(() => log.rows.slice(0, 15).reverse().map((r) => ({ r, v: num(String(r.stats[stat] ?? '').split(/[-/]/)[0]) })), [log, stat]);
  const max = Math.max(...chart.map((c) => c.v), 1);
  const avg = chart.length ? chart.reduce((s, c) => s + c.v, 0) / chart.length : 0;

  if (!log.rows.length) return <Card className="py-10 text-center text-label-2">No games played yet this season.</Card>;

  return (
    <div>
      <Card className="px-4 pb-3 pt-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[13px] font-semibold text-label-2">{log.labels[stat]} · last {chart.length} games</div>
          <div className="text-[13px] text-label-2">avg <span className="num font-bold text-label">{avg.toFixed(1)}</span></div>
        </div>
        <div className="relative mt-3 flex h-[110px] items-end gap-[3px] md:h-[130px]">
          <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-label-3" style={{ bottom: `${(avg / max) * 100}%` }} />
          {chart.map(({ r, v }) => (
            <Link
              key={r.id}
              to={`/${lg}/game/${r.id}`}
              title={`${new Date(r.date).toLocaleDateString()} ${r.atVs} ${r.opp}: ${v}`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              <span className="num pointer-events-none mb-0.5 text-center text-[9.5px] font-semibold text-label-2 md:text-[10px]">{v}</span>
              <div
                className={`w-full rounded-t-[4px] transition-all duration-500 group-hover:opacity-80 ${r.result === 'W' ? 'bg-accent' : 'bg-label-3'}`}
                style={{ height: `${Math.max((v / max) * 100, 2)}%` }}
              />
            </Link>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-label-3">
          <span>{chart[0] && new Date(chart[0].r.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent" />Win</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-label-3" />Loss</span>
          </span>
          <span>{chart.at(-1) && new Date(chart.at(-1).r.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </div>
      </Card>
      <Chips className="mt-3" value={stat} onChange={setStat} options={options} />

      <Card className="mt-3 overflow-hidden">
        <SimpleTable
          first="Game"
          head={order.map((i) => log.labels[i])}
          rows={log.rows.slice(0, limit).map((r) => (
            <tr key={r.id} onClick={() => go(`/${lg}/game/${r.id}`)} className="cursor-pointer border-t border-sep transition hover:bg-fill/40 active:bg-fill">
              <td className="sticky left-0 z-10 bg-card py-2.5 pl-4 pr-3">
                <Link to={`/${lg}/game/${r.id}`} className="flex items-center gap-2">
                  <span className="w-12 text-[12px] text-label-2">{new Date(r.date).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}</span>
                  <span className="w-3 text-[11px] text-label-2">{r.atVs}</span>
                  <TeamLogo abbr={r.opp} size={20} />
                  <span className="w-9 text-[13px] font-semibold">{r.opp}</span>
                  <span className={`text-[12px] font-bold ${r.result === 'W' ? 'text-win' : r.result === 'L' ? 'text-live' : 'text-label-2'}`}>{r.result}</span>
                  <span className="text-[12px] text-label-2">{r.score}</span>
                  {r.playoff && <span className="rounded bg-accent/12 px-1 text-[10px] font-bold text-accent">PO</span>}
                </Link>
              </td>
              {order.map((i) => (
                <td key={i} className={`px-2.5 text-center ${i === stat ? 'font-bold' : 'text-label-2'}`}>{r.stats[i]}</td>
              ))}
            </tr>
          ))}
        />
      </Card>
      {log.rows.length > limit && (
        <button onClick={() => setLimit((l) => l + 25)} className="mt-2 w-full rounded-xl py-2 text-[14px] font-semibold text-accent hover:bg-fill">
          Show more games
        </button>
      )}
      <p className="mt-1.5 px-1 text-[11.5px] text-label-3">Tap any game or bar to open it.</p>
    </div>
  );
}

const BEST_KEYS = { nba: ['PTS', 'REB', 'AST'], nfl: [] };

/** The best single games of a career, by whichever stat is picked. */
function BestGames({ seasons, lg, id }) {
  const cur = currentSeason(lg);
  const list = seasons?.length ? seasons : [cur, cur - 1, cur - 2];
  const { data, error, loading, reload } = useData((fresh) => getCareerGames(lg, id, list, { fresh }), [lg, id, list.join()]);
  const [stat, setStat] = useState(null);
  const [when, setWhen] = useState('all');
  const [limit, setLimit] = useState(10);

  const options = useMemo(
    () =>
      (data?.labels ?? [])
        .map((l, i, all) => {
          // NFL logs repeat labels (passing YDS, rushing YDS), so those get their category in front.
          const twice = all.indexOf(l) !== all.lastIndexOf(l);
          const cat = (data.names[i] ?? '').match(/^(Pass|Rush|Rec)/)?.[1];
          return { value: i, label: twice && cat ? `${cat} ${l}` : l, raw: l };
        })
        .filter((o) => !/%|AVG|RTG|QBR|LNG|MIN|PF|^TO$|\+\/-/i.test(o.raw)),
    [data]
  );
  const fallback = options.find((o) => o.raw === (lg === 'nba' ? 'PTS' : 'YDS'))?.value ?? options[0]?.value ?? 0;
  const sel = stat ?? fallback;
  const top = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter((r) => (when === 'all' ? true : when === 'po' ? r.playoff : !r.playoff))
      .map((r) => ({ r, v: num(String(r.stats[sel] ?? '').split(/[-/]/)[0]) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v || new Date(b.r.date) - new Date(a.r.date));
  }, [data, sel, when]);

  if (loading && !data) {
    return (
      <div>
        <div className="mb-2 px-1 text-[13px] text-label-2">Going through {list.length} {list.length === 1 ? 'season' : 'seasons'} of games…</div>
        <Skeleton className="h-[360px] !rounded-2xl" />
      </div>
    );
  }
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data?.rows.length) return <Card className="py-10 text-center text-label-2">No games on record.</Card>;

  const keys = BEST_KEYS[lg].map((k) => [k, data.labels.indexOf(k)]).filter(([, i]) => i >= 0 && i !== sel);
  const hasPlayoffs = data.rows.some((r) => r.playoff);
  return (
    <div>
      <Chips value={sel} onChange={(v) => { setStat(v); setLimit(10); }} options={options} />
      {hasPlayoffs && (
        <Segmented
          className="mt-3"
          value={when}
          onChange={(v) => { setWhen(v); setLimit(10); }}
          options={[
            { value: 'all', label: 'All games' },
            { value: 'reg', label: 'Regular season' },
            { value: 'po', label: 'Playoffs' },
          ]}
        />
      )}
      <div className="mb-1 mt-3 px-1 text-[13px] text-label-2">
        Most {(data.names[sel] ?? data.labels[sel]).replace('Made-Attempted', 'Made').toLowerCase()} in a game · {data.rows.length} career games
        {data.missed > 0 && ` · ${data.missed} ${data.missed === 1 ? 'season' : 'seasons'} could not be loaded`}
      </div>
      {top.length ? (
        <Card className="divide-y divide-sep overflow-hidden">
          {top.slice(0, limit).map(({ r, v }, i) => (
            <Link key={r.id} to={`/${lg}/game/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-fill/40 active:bg-fill">
              <span className={`num w-5 text-center text-[13px] font-bold ${i < 3 ? 'text-accent' : 'text-label-3'}`}>{i + 1}</span>
              <span className="num w-12 text-[24px] font-bold leading-none tracking-tight">{r.stats[sel]}</span>
              <TeamLogo abbr={r.opp} size={26} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                  <span className="truncate">{r.atVs} {r.opp}</span>
                  <span className={`text-[12px] font-bold ${r.result === 'W' ? 'text-win' : r.result === 'L' ? 'text-live' : 'text-label-2'}`}>{r.result}</span>
                  <span className="text-[12px] font-normal text-label-2">{r.score}</span>
                  {r.playoff && <span className="rounded bg-accent/12 px-1 text-[10px] font-bold text-accent">PO</span>}
                </span>
                <span className="block truncate text-[12px] text-label-2">
                  {new Date(r.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  {keys.map(([k, ix]) => ` · ${r.stats[ix]} ${k}`).join('')}
                </span>
              </span>
              <svg aria-hidden width="8" height="13" viewBox="0 0 8 13" className="shrink-0 text-label-3">
                <path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="py-10 text-center text-label-2">Nothing to rank here.</Card>
      )}
      {top.length > limit && (
        <button onClick={() => setLimit((l) => l + 15)} className="mt-2 w-full rounded-xl py-2 text-[14px] font-semibold text-accent hover:bg-fill">
          Show more
        </button>
      )}
    </div>
  );
}

function Splits({ splits }) {
  if (!splits?.rows.length) return <Card className="py-10 text-center text-label-2">No stats available.</Card>;
  return (
    <Card className="overflow-hidden">
      <SimpleTable
        first="Split"
        head={splits.labels}
        rows={splits.rows.map((r) => (
          <tr key={r.label} className="border-t border-sep">
            <td className="sticky left-0 z-10 bg-card py-2.5 pl-4 pr-3 font-semibold">{r.label}</td>
            {r.stats.map((s, i) => <td key={i} className="px-2.5 text-center">{s}</td>)}
          </tr>
        ))}
      />
    </Card>
  );
}

function SeasonCell({ to, className, children }) {
  return to ? <Link to={to} className={`${className} text-accent active:opacity-60`}>{children}</Link> : <span className={className}>{children}</span>;
}

function Career({ career, lg }) {
  const [key, setKey] = useState(career?.[0]?.key);
  const cat = career?.find((c) => c.key === key) ?? career?.[0];
  if (!cat) return <Card className="py-10 text-center text-label-2">No career stats available.</Card>;
  return (
    <div>
      {career.length > 1 && (
        <Chips className="mb-3" value={cat.key} onChange={setKey} options={career.map((c) => ({ value: c.key, label: c.title }))} />
      )}
      <Card className="overflow-hidden">
        <SimpleTable
          head={['Team', ...cat.labels]}
          rows={[
            ...[...cat.rows].reverse().map((r, i) => {
              // Tap a season to open that team's page for that year.
              const to = r.teamId && r.year >= firstSeason(lg, 'team') ? `/${lg}/team/${r.teamId}?season=${r.year}` : null;
              return (
              <tr key={`${r.season}${r.team}${i}`} className="border-t border-sep">
                <td className="sticky left-0 z-10 bg-card py-2 pl-4 pr-3 font-semibold">
                  <SeasonCell to={to} className="block whitespace-nowrap">{r.season}</SeasonCell>
                </td>
                <td className="px-2.5">
                  <SeasonCell to={to} className="flex items-center gap-1.5 text-[12px] font-semibold">
                    {r.team && <TeamLogo abbr={r.team} size={18} league={lg} />}
                    {r.team}
                  </SeasonCell>
                </td>
                {r.stats.map((s, j) => <td key={j} className="px-2.5 text-center text-label-2">{s}</td>)}
              </tr>
              );
            }),
            cat.totals?.length ? (
              <tr key="totals" className="border-t-2 border-sep font-semibold">
                <td className="sticky left-0 z-10 bg-card py-2.5 pl-4">Career</td>
                <td />
                {cat.totals.map((s, j) => <td key={j} className="px-2.5 text-center">{s}</td>)}
              </tr>
            ) : null,
          ]}
        />
      </Card>
    </div>
  );
}

function News({ news }) {
  if (!news.length) return <Card className="py-10 text-center text-label-2">No recent news.</Card>;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {news.map((n) => (
        <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="block transition active:scale-[0.99]">
          <Card className="flex h-full gap-3 overflow-hidden p-3 hover:bg-card-2">
            {n.image && <img src={n.image} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0">
              <div className="line-clamp-2 text-[15px] font-semibold leading-snug">{n.headline}</div>
              <div className="mt-1 line-clamp-2 text-[12px] text-label-2">{n.description}</div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-label-3">
                {n.published && new Date(n.published).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                <Icon.External className="h-3 w-3" />
              </div>
            </div>
          </Card>
        </a>
      ))}
    </div>
  );
}

export default function Player() {
  const { id } = useParams();
  const lg = useLeague();
  const [tab, setTab] = useState('log');
  const { data: p, error, loading, reload } = useData((fresh) => getPlayer(lg, id, { fresh }), [lg, id]);

  const tabs = [
    { value: 'log', label: 'Games' },
    { value: 'best', label: 'Best' },
    { value: 'splits', label: 'Splits' },
    { value: 'career', label: 'Career' },
    { value: 'news', label: 'News' },
  ];

  return (
    <div>
      <BackButton />
      {loading && !p ? (
        <div className="space-y-3">
          <Skeleton className="h-[220px] !rounded-2xl" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[92px] !rounded-2xl" />)}</div>
          <Skeleton className="h-[300px] !rounded-2xl" />
        </div>
      ) : error && !p ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="rise" key={`${lg}:${id}`}>
          <Hero bio={p.bio} lg={lg} />
          <SummaryTiles
            bio={p.bio}
            lg={lg}
            id={id}
            onGameLog={() => {
              setTab('log');
              document.getElementById('player-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
          <Facts bio={p.bio} />
          <div id="player-tabs" className="scroll-mt-20">
            <Segmented className="mt-7" value={tab} onChange={setTab} options={tabs} />
          </div>
          <div className="mt-3">
            {tab === 'log' && <SeasonGameLog initial={p.gamelog} lg={lg} id={id} />}
            {tab === 'best' && <BestGames seasons={p.gamelog?.seasons} lg={lg} id={id} />}
            {tab === 'splits' && <Splits splits={p.splits} />}
            {tab === 'career' && <Career career={p.career} lg={lg} />}
            {tab === 'news' && <News news={p.news} />}
          </div>
        </div>
      )}
    </div>
  );
}
