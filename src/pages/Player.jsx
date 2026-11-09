import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPlayer } from '../api/espn';
import { Icon } from '../components/icons';
import { BackButton, Card, Chips, ErrorState, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
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
        <img src={bio.headshot} alt="" className="pointer-events-none absolute bottom-0 right-[-20px] h-[190px] w-auto object-contain object-bottom md:right-4 md:h-[250px]" />
      )}
      <div className="relative min-h-[200px] p-5 md:min-h-[250px] md:p-7">
        <div className="max-w-[60%]">
          <div className="text-[15px] text-label-2">{bio.first}</div>
          <h1 className="font-display text-[32px] font-bold leading-[1.05] tracking-tight [overflow-wrap:anywhere] md:text-[44px]">{bio.last}</h1>
          <div className="mt-2 text-[14px] text-label-2">
            {[bio.jersey && `#${bio.jersey}`, bio.position].filter(Boolean).join(' · ')}
          </div>
          {bio.team && (
            <Link to={`/${lg}/team/${bio.team.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[13px] font-semibold transition hover:bg-fill-strong">
              <TeamLogo abbr={bio.team.abbr} size={18} />
              {bio.team.name}
            </Link>
          )}
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

function SummaryTiles({ bio, lg }) {
  if (!bio.summary.length) return null;
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-label-2">{bio.summaryTitle}</span>}>This Season</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {bio.summary.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-label-2">{s.label}</div>
            <div className="num mt-1 font-display text-[30px] font-bold leading-none tracking-tight">{s.value}</div>
            {s.rank && <div className="mt-1.5 text-[12px] text-label-2">{s.rank} in {lg.toUpperCase()}</div>}
          </Card>
        ))}
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
          <div key={k} className="bg-card px-4 py-3">
            <div className="text-[12px] text-label-2">{k}</div>
            <div className="mt-0.5 text-[15px] font-semibold">{v}</div>
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

function GameLog({ log, lg }) {
  const options = log.labels.map((l, i) => ({ value: i, label: l }));
  const defaultIdx = Math.max(0, log.labels.indexOf(lg === 'nba' ? 'PTS' : 'YDS'));
  const [stat, setStat] = useState(defaultIdx);
  const [limit, setLimit] = useState(15);

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
        <div className="relative mt-3 flex h-[130px] items-end gap-[3px]">
          <div aria-hidden className="absolute inset-x-0 border-t border-dashed border-label-3" style={{ bottom: `${(avg / max) * 100}%` }} />
          {chart.map(({ r, v }) => (
            <Link
              key={r.id}
              to={`/${lg}/game/${r.id}`}
              title={`${new Date(r.date).toLocaleDateString()} ${r.atVs} ${r.opp}: ${v}`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              <span className="num pointer-events-none mb-0.5 text-center text-[10px] font-semibold text-label-2 opacity-0 transition group-hover:opacity-100 md:opacity-100">{v}</span>
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
          head={log.labels}
          rows={log.rows.slice(0, limit).map((r) => (
            <tr key={r.id} className="border-t border-sep">
              <td className="sticky left-0 z-10 bg-card py-2 pl-4 pr-3">
                <Link to={`/${lg}/game/${r.id}`} className="flex items-center gap-2">
                  <span className="w-12 text-[12px] text-label-2">{new Date(r.date).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}</span>
                  <span className="w-3 text-[11px] text-label-2">{r.atVs}</span>
                  <TeamLogo abbr={r.opp} size={20} />
                  <span className="w-9 text-[13px] font-semibold">{r.opp}</span>
                  <span className={`text-[12px] font-bold ${r.result === 'W' ? 'text-win' : r.result === 'L' ? 'text-live' : 'text-label-2'}`}>{r.result}</span>
                  <span className="text-[12px] text-label-2">{r.score}</span>
                </Link>
              </td>
              {r.stats.map((s, i) => (
                <td key={i} className={`px-2.5 text-center ${i === stat ? 'font-bold' : 'text-label-2'}`}>{s}</td>
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
            ...[...cat.rows].reverse().map((r, i) => (
              <tr key={`${r.season}${r.team}${i}`} className="border-t border-sep">
                <td className="sticky left-0 z-10 bg-card py-2 pl-4 pr-3 font-semibold">{r.season}</td>
                <td className="px-2.5">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    {r.team && <TeamLogo abbr={r.team} size={18} league={lg} />}
                    {r.team}
                  </span>
                </td>
                {r.stats.map((s, j) => <td key={j} className="px-2.5 text-center text-label-2">{s}</td>)}
              </tr>
            )),
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
    <div className="grid gap-3 md:grid-cols-2">
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
        <div className="rise">
          <Hero bio={p.bio} lg={lg} />
          <SummaryTiles bio={p.bio} lg={lg} />
          <Facts bio={p.bio} />
          <Segmented className="mt-7" value={tab} onChange={setTab} options={tabs} />
          <div className="mt-3">
            {tab === 'log' && (p.gamelog ? <GameLog log={p.gamelog} lg={lg} /> : <Card className="py-10 text-center text-label-2">No game log available.</Card>)}
            {tab === 'splits' && <Splits splits={p.splits} />}
            {tab === 'career' && <Career career={p.career} lg={lg} />}
            {tab === 'news' && <News news={p.news} />}
          </div>
        </div>
      )}
    </div>
  );
}
