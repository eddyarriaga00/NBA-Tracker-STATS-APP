import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fromKey, getNbaScoreboard, getNflScoreboard, toKey } from '../api/espn';
import { useCommentCounts } from '../components/Comments';
import GameCard from '../components/GameCard';
import { Icon } from '../components/icons';
import { Empty, ErrorState, PageTitle, Skeleton } from '../components/ui';
import { useFavorites } from '../lib/favorites';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function GameGrid({ games, loading, error, reload, emptyTitle, emptySub }) {
  const rooms = useMemo(() => (games ?? []).map((g) => `${g.league}:game:${g.id}`), [games]);
  const counts = useCommentCounts(rooms);
  const { isFav } = useFavorites();
  const fav = (g) => isFav(g.league, g.home.id) || isFav(g.league, g.away.id);
  const sorted = games ? [...games.filter(fav), ...games.filter((g) => !fav(g))] : games;
  if (loading && !games)
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[156px] !rounded-2xl" />)}
      </div>
    );
  if (error && !games) return <ErrorState error={error} onRetry={reload} />;
  if (!games.length) return <Empty title={emptyTitle} subtitle={emptySub} />;
  return (
    <div className="grid gap-2.5 md:grid-cols-2 md:gap-3">
      {sorted.map((g, i) => <GameCard key={g.id} g={g} index={i} favorite={fav(g)} comments={counts[`${g.league}:game:${g.id}`] ?? 0} />)}
    </div>
  );
}

// ---------- NBA: pick a day ----------

function DateStrip({ selected, onSelect }) {
  const todayKey = toKey(new Date());
  const selKey = toKey(selected);
  const start = addDays(selected, -selected.getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="flex items-center gap-1">
      <button aria-label="Previous week" onClick={() => onSelect(addDays(selected, -7))} className="grid h-9 w-8 shrink-0 place-items-center rounded-full text-accent hover:bg-fill">
        <Icon.ChevronLeft className="h-5 w-5" />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {days.map((d) => {
          const k = toKey(d);
          const sel = k === selKey;
          return (
            <button
              key={k}
              onClick={() => onSelect(d)}
              className={`flex flex-col items-center rounded-xl py-1 transition active:scale-95 md:py-1.5 ${
                sel ? 'bg-accent text-white shadow-[0_4px_14px_rgba(0,122,255,0.35)]' : 'hover:bg-fill'
              }`}
            >
              <span className={`text-[10px] font-semibold uppercase md:text-[11px] ${sel ? 'text-white/80' : 'text-label-2'}`}>
                {d.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className={`num text-[15px] font-semibold md:text-[17px] ${!sel && k === todayKey ? 'text-accent' : ''}`}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>
      <button aria-label="Next week" onClick={() => onSelect(addDays(selected, 7))} className="grid h-9 w-8 shrink-0 place-items-center rounded-full text-accent hover:bg-fill">
        <Icon.ChevronRight className="h-5 w-5" />
      </button>
      <label className="relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-accent hover:bg-fill">
        <Icon.Calendar className="h-5 w-5" />
        <span className="sr-only">Pick a date</span>
        <input
          type="date"
          value={`${selKey.slice(0, 4)}-${selKey.slice(4, 6)}-${selKey.slice(6)}`}
          onChange={(e) => e.target.value && onSelect(fromKey(e.target.value.replaceAll('-', '')))}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function NbaScores() {
  const [params, setParams] = useSearchParams();
  const key = /^\d{8}$/.test(params.get('d') ?? '') ? params.get('d') : toKey(new Date());
  const date = useMemo(() => fromKey(key), [key]);
  const isToday = key === toKey(new Date());

  const { data: games, error, loading, reload } = useData((fresh) => getNbaScoreboard(key, { fresh }), [key], {
    pollMs: 20_000,
    shouldPoll: (g) => g.some((x) => x.status.state === 'in') || (isToday && g.some((x) => x.status.state === 'pre')),
  });

  const select = (d) => {
    const k = toKey(d);
    setParams(k === toKey(new Date()) ? {} : { d: k }, { replace: true });
  };
  const live = games?.filter((g) => g.status.state === 'in').length ?? 0;

  return (
    <div>
      <PageTitle
        eyebrow={date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        right={
          <>
            {live > 0 && <span className="rounded-full bg-live/12 px-2.5 py-1 text-[12px] font-semibold text-live">{live} Live</span>}
            {!isToday && (
              <button onClick={() => select(new Date())} className="rounded-full bg-fill px-3 py-1 text-[13px] font-semibold text-accent active:opacity-70">
                Today
              </button>
            )}
          </>
        }
      >
        Scores
      </PageTitle>
      <DateStrip selected={date} onSelect={select} />
      <div className="mt-4">
        <GameGrid games={games} loading={loading} error={error} reload={reload} emptyTitle="No Games" emptySub="There are no NBA games on this day." />
      </div>
    </div>
  );
}

// ---------- NFL: pick a week ----------

function weekChipLabel(type, w) {
  if (type === '1') return w.label.replace('Preseason ', 'Pre ').replace('Week ', 'Wk ').replace('Hall of Fame Weekend', 'HOF');
  if (type === '3') return w.label.replace(' Round', '').replace('Conference Championship', 'Conf. Champ.');
  return w.short;
}

function NflScores() {
  const [params, setParams] = useSearchParams();
  const w = params.get('w');
  const sel = w && /^\d-\d+-\d{4}$/.test(w) ? (([type, week, year]) => ({ type, week, year }))(w.split('-')) : null;
  const strip = useRef(null);

  const { data, error, loading, reload } = useData((fresh) => getNflScoreboard(sel, { fresh }), [w], {
    pollMs: 20_000,
    shouldPoll: (d) => d.games.some((x) => x.status.state === 'in'),
  });

  const curKey = data ? `${data.type}-${data.week}` : null;
  const chips = useMemo(() => {
    if (!data) return [];
    return data.calendar
      .filter((c) => c.type !== '1' || data.type === '1')
      .flatMap((c) => c.weeks.map((wk) => ({ key: `${c.type}-${wk.week}`, type: c.type, week: wk.week, label: weekChipLabel(c.type, wk), detail: wk.detail })));
  }, [data]);

  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector('[data-active]');
    if (el) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, [curKey, chips.length]);

  const pick = (c) => setParams({ w: `${c.type}-${c.week}-${data.year}` }, { replace: true });

  const days = useMemo(() => {
    if (!data) return [];
    const m = new Map();
    for (const g of data.games) {
      const label = new Date(g.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      if (!m.has(label)) m.set(label, []);
      m.get(label).push(g);
    }
    return [...m.entries()];
  }, [data]);

  const current = chips.find((c) => c.key === curKey);
  const live = data?.games.filter((g) => g.status.state === 'in').length ?? 0;
  const idx = chips.findIndex((c) => c.key === curKey);

  return (
    <div>
      <PageTitle
        eyebrow={current ? `${current.label.replace('Wk', 'Week')} · ${current.detail ?? ''}` : 'NFL'}
        right={
          <>
            {live > 0 && <span className="rounded-full bg-live/12 px-2.5 py-1 text-[12px] font-semibold text-live">{live} Live</span>}
            {w && (
              <button onClick={() => setParams({}, { replace: true })} className="rounded-full bg-fill px-3 py-1 text-[13px] font-semibold text-accent active:opacity-70">
                This Week
              </button>
            )}
          </>
        }
      >
        Scores
      </PageTitle>

      <div className="flex items-center gap-1">
        <button aria-label="Previous week" disabled={idx <= 0} onClick={() => pick(chips[idx - 1])} className="grid h-9 w-8 shrink-0 place-items-center rounded-full text-accent hover:bg-fill disabled:opacity-30">
          <Icon.ChevronLeft className="h-5 w-5" />
        </button>
        <div ref={strip} className="no-scrollbar relative flex flex-1 gap-1.5 overflow-x-auto py-1">
          {chips.map((c) => (
            <button
              key={c.key}
              data-active={c.key === curKey || undefined}
              onClick={() => pick(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition active:scale-95 md:px-3.5 md:py-1.5 md:text-[14px] ${
                c.key === curKey ? 'bg-accent text-white shadow-[0_4px_14px_rgba(0,122,255,0.35)]' : 'bg-card text-label-2 hover:text-label'
              }`}
            >
              {c.label}
            </button>
          ))}
          {!chips.length && <Skeleton className="h-8 w-full" />}
        </div>
        <button aria-label="Next week" disabled={idx < 0 || idx >= chips.length - 1} onClick={() => pick(chips[idx + 1])} className="grid h-9 w-8 shrink-0 place-items-center rounded-full text-accent hover:bg-fill disabled:opacity-30">
          <Icon.ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <GameGrid loading />
        ) : error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data.games.length ? (
          <Empty title="No Games" subtitle="There are no NFL games this week." />
        ) : (
          days.map(([label, games]) => (
            <section key={label} className="mb-5">
              <h2 className="mb-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:mb-2 md:text-[13px]">{label}</h2>
              <GameGrid games={games} />
            </section>
          ))
        )}
        {data?.byes?.length > 0 && (
          <p className="mt-2 px-1 text-[13px] text-label-2">
            <span className="font-semibold">Bye:</span> {data.byes.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Scores() {
  const lg = useLeague();
  return lg === 'nfl' ? <NflScores /> : <NbaScores />;
}
