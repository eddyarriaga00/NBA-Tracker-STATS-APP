import { useEffect, useMemo, useState } from 'react';
import { getMoves } from '../api/espn';
import { KINDS, MoveRow, dayLabel } from '../components/Moves';
import { BackButton, Card, Chips, Empty, ErrorState, PageTitle, Skeleton } from '../components/ui';
import { useFavorites } from '../lib/favorites';
import { useLeague } from '../lib/league';
import { useSeen } from '../lib/useSeen';

/** One day's moves. Player photos are looked up only once the day is near the screen. */
function Day({ day, list, lg }) {
  const [ref, seen] = useSeen(500);
  return (
    <section ref={ref} className="mb-5">
      <h2 className="mb-1.5 flex items-baseline gap-1.5 px-1 text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:text-[13px]">
        <span>{dayLabel(day, true)}</span>
        <span className="font-normal text-label-3">· {list.length}</span>
      </h2>
      <Card className="divide-y divide-sep overflow-hidden">
        {list.map((m) => <MoveRow key={m.key} m={m} lg={lg} load={seen} />)}
      </Card>
    </section>
  );
}

/** Trades, signings, releases and injury-list moves for the league, newest first. */
export default function Moves() {
  const lg = useLeague();
  const { favs, isFav } = useFavorites();
  const [filter, setFilter] = useState('all');
  const [state, setState] = useState({ lg, moves: null, page: 0, more: true, loading: false, error: null });

  const load = async (page, fresh = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const r = await getMoves(lg, page, { fresh });
      setState((s) => (s.lg !== lg ? s : { lg, moves: [...(page === 1 ? [] : s.moves ?? []), ...r.moves], page, more: r.more, loading: false, error: null }));
    } catch (error) {
      setState((s) => (s.lg !== lg ? s : { ...s, loading: false, error }));
    }
  };
  useEffect(() => {
    setState({ lg, moves: null, page: 0, more: true, loading: true, error: null });
    setFilter('all');
    load(1);
  }, [lg]); // eslint-disable-line react-hooks/exhaustive-deps

  const moves = state.lg === lg ? state.moves : null;
  const hasFavs = favs.some((f) => f.startsWith(`${lg}:`));
  const options = [
    { value: 'all', label: 'All' },
    { value: 'trade', label: 'Trades' },
    ...(hasFavs ? [{ value: 'mine', label: 'My teams' }] : []),
    { value: 'sign', label: 'Signed' },
    { value: 'cut', label: 'Released' },
    { value: 'injury', label: 'Injury list' },
  ];
  const days = useMemo(() => {
    const list = (moves ?? []).filter((m) =>
      filter === 'all' ? true : filter === 'mine' ? isFav(lg, m.team.id) || (m.other && isFav(lg, m.other.id)) : m.kind === filter
    );
    const by = new Map();
    for (const m of list) by.set(m.day, [...(by.get(m.day) ?? []), m]);
    return [...by.entries()];
  }, [moves, filter, favs, lg]); // eslint-disable-line react-hooks/exhaustive-deps
  const oldest = moves?.length ? moves[moves.length - 1].day : null;

  return (
    <div>
      <BackButton label="Scores" fallback={`/${lg}`} />
      <PageTitle eyebrow={lg.toUpperCase()}>Trades &amp; Moves</PageTitle>
      <Chips options={options} value={filter} onChange={setFilter} className="mb-4" />
      {!moves && state.error ? (
        <ErrorState error={state.error} onRetry={() => load(1, true)} />
      ) : !moves ? (
        <div className="space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[180px] !rounded-2xl" />)}</div>
      ) : (
        <>
          {!days.length && (
            <Empty
              title={filter === 'trade' ? 'No trades' : 'Nothing here'}
              subtitle={`No ${filter === 'mine' ? 'moves by your teams' : filter === 'all' ? 'moves' : (KINDS[filter]?.label ?? '').toLowerCase() + ' moves'} since ${oldest ? dayLabel(oldest) : 'the season began'}.`}
            />
          )}
          {days.map(([day, list]) => <Day key={day} day={day} list={list} lg={lg} />)}
          {state.more && (
            <button
              disabled={state.loading}
              onClick={() => load(state.page + 1)}
              className="w-full rounded-2xl bg-card py-3 text-[14px] font-semibold text-accent active:opacity-70 disabled:text-label-3"
            >
              {state.loading ? 'Loading…' : `Load moves before ${oldest ? dayLabel(oldest) : 'these'}`}
            </button>
          )}
          {state.error && <p className="mt-2 px-1 text-center text-[13px] text-live">Couldn’t load more. Try again.</p>}
          <p className="mt-3 px-1 text-[11.5px] leading-snug text-label-3">From the league’s official transaction list. Moves are dated by day; the list doesn’t give a time of day.</p>
        </>
      )}
    </div>
  );
}
