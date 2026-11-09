import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LEADER_CATS, getLeaders } from '../api/espn';
import { Card, Chips, ErrorState, Headshot, PageTitle, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';

function Hero({ p, cat }) {
  const { dark } = useTheme();
  const lg = useLeague();
  const c = visibleColor(p.team.color, dark);
  return (
    <Link to={`/${lg}/player/${p.id}`} className="block transition active:scale-[0.99]">
      <Card className="rise relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 140% at 100% 100%, ${c}55 0%, ${c}18 45%, transparent 70%)` }} />
        {p.headshot && (
          <img src={p.headshot} alt="" className="pointer-events-none absolute bottom-0 right-[-20px] h-[160px] w-auto object-contain object-bottom md:right-0 md:h-[240px]" />
        )}
        <div className="relative min-h-[170px] p-4 md:min-h-[250px] md:p-5">
          <div className="max-w-[58%]">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-label-2">
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">#1</span>
              {cat.label}
            </div>
            <div className="mt-1.5 text-[13px] text-label-2 md:mt-2 md:text-[15px]">{p.first}</div>
            <div className="font-display text-[24px] font-bold leading-[1.1] tracking-tight [overflow-wrap:anywhere] md:text-[28px]">{p.last}</div>
            <div className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[13px] text-label-2">
              <TeamLogo abbr={p.team.abbr} size={18} />
              {p.team.abbr} · {p.pos}
            </div>
            <div className="num mt-3 font-display text-[42px] font-bold leading-none tracking-tight md:mt-4 md:text-[52px]">{p.value}</div>
            <div className="mt-1 text-[13px] font-semibold text-label-2">{cat.unit}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function Leaders() {
  const lg = useLeague();
  const cats = LEADER_CATS[lg];
  const [picked, setKey] = useState(cats[0].key);
  const key = cats.some((c) => c.key === picked) ? picked : cats[0].key;
  const { data, error, loading, reload } = useData((fresh) => getLeaders(lg, { fresh }), [lg]);
  const cat = cats.find((c) => c.key === key);
  const list = data?.categories[key] ?? [];
  const num = (v) => parseFloat(String(v).replace(/,/g, '')) || 0;
  const max = Math.max(...list.map((p) => num(p.value)), 1);

  return (
    <div>
      <PageTitle eyebrow={data?.season || lg.toUpperCase()}>Leaders</PageTitle>
      <Chips
        className="mb-4"
        value={key}
        onChange={setKey}
        options={cats.filter((c) => !data || data.categories[c.key]?.length).map((c) => ({ value: c.key, label: c.short }))}
      />

      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-[220px] !rounded-2xl" />
          <Skeleton className="h-[480px] !rounded-2xl" />
        </div>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : list.length === 0 ? (
        <Card className="py-12 text-center text-label-2">No leaders yet for this category.</Card>
      ) : (
        <div key={key} className="grid gap-3 md:grid-cols-[1fr_1.15fr] md:items-start">
          <Hero p={list[0]} cat={cat} />
          <Card className="rise divide-y divide-sep" style={{ animationDelay: '60ms' }}>
            {list.slice(1).map((p, i) => (
              <Link key={p.id} to={`/${lg}/player/${p.id}`} className="flex items-center gap-2.5 px-3.5 py-2 transition hover:bg-fill/40 md:gap-3 md:px-4 md:py-2.5">
                <span className="num w-5 text-right text-[13px] font-semibold text-label-2">{i + 2}</span>
                <Headshot src={p.headshot} size={36} className="md:h-[42px] md:w-[42px]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold md:text-[15px]">{p.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <TeamLogo abbr={p.team.abbr} size={14} />
                    <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-fill">
                      <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${(num(p.value) / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <span className="num w-14 text-right font-display text-[17px] font-bold md:w-16 md:text-[20px]">{p.value}</span>
              </Link>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
