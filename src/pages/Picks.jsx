import { useMemo, useState } from 'react';
import { getNbaScoreboard, getNflScoreboard, toKey } from '../api/espn';
import { FriendsTabs, Leaderboard, NameGate, PickCard } from '../components/Picks';
import { Chips, Empty, ErrorState, PageTitle, SectionTitle, Skeleton } from '../components/ui';
import { useLeague } from '../lib/league';
import { isLocked, usePicks } from '../lib/picks';
import { useData } from '../lib/useData';

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
// Games refresh every minute so cards lock and show results on their own.
const POLL = (games) => (games?.some((g) => g.status.state !== 'post') ? 60_000 : 0);

function dayOptions() {
  const today = new Date();
  return [-1, 0, 1, 2, 3].map((n) => {
    const d = addDays(today, n);
    const label = n === -1 ? 'Yesterday' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return { value: toKey(d), label };
  });
}

function Games({ league, games, name }) {
  const ids = useMemo(() => games.filter((g) => !g.home.tbd && !g.away.tbd).map((g) => g.id), [games]);
  const { byGame, me, pick, clear, error } = usePicks(league, ids);
  const open = games.filter((g) => !isLocked(g));
  const pickedOpen = open.filter((g) => byGame[g.id]?.some((r) => r.user_id === me)).length;
  const sorted = [...games].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return (
    <>
      <div className="mb-2 flex items-center justify-between px-1 text-[12.5px] text-label-2">
        <span>{open.length ? `${pickedOpen} of ${open.length} open games picked` : 'All games here are locked'}</span>
        <span>Locks at start time</span>
      </div>
      {error && <p className="mb-2 px-1 text-[13px] text-live">{error}</p>}
      <div className="grid gap-2.5 md:grid-cols-2">
        {sorted
          .filter((g) => !g.home.tbd && !g.away.tbd)
          .map((g) => (
            <PickCard key={g.id} g={g} rows={byGame[g.id]} me={me} onPick={(game, t) => pick(game, t, name)} onClear={clear} />
          ))}
      </div>
    </>
  );
}

function NbaSlate({ name }) {
  const days = useMemo(dayOptions, []);
  const [day, setDay] = useState(days[1].value);
  const { data, error, loading, reload } = useData((fresh) => getNbaScoreboard(day, { fresh }), [day], { pollMs: POLL });
  return (
    <>
      <Chips options={days} value={day} onChange={setDay} className="mb-3" />
      {loading && !data ? (
        <Skeleton className="h-[260px] !rounded-2xl" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data.length ? (
        <Empty title="No games" subtitle="Pick another day." />
      ) : (
        <Games league="nba" games={data} name={name} />
      )}
    </>
  );
}

function NflSlate({ name }) {
  const { data, error, loading, reload } = useData((fresh) => getNflScoreboard(null, { fresh }), ['nfl-week'], {
    pollMs: (d) => POLL(d?.games),
  });
  return loading && !data ? (
    <Skeleton className="h-[260px] !rounded-2xl" />
  ) : error && !data ? (
    <ErrorState error={error} onRetry={reload} />
  ) : !data.games.length ? (
    <Empty title="No games this week" />
  ) : (
    <>
      <div className="mb-2 px-1 text-[13px] font-semibold text-label-2">
        {data.calendar.find((c) => c.type === data.type)?.weeks.find((w) => w.week === data.week)?.label ?? `Week ${data.week}`}
      </div>
      <Games league="nfl" games={data.games} name={name} />
    </>
  );
}

export default function Picks() {
  const league = useLeague();
  return (
    <div>
      <PageTitle eyebrow={`${league.toUpperCase()} · Friends`}>Pick’em</PageTitle>
      <FriendsTabs />
      <NameGate>
        {(name) => (
          <>
            <Leaderboard league={league} />
            <SectionTitle>Make your picks</SectionTitle>
            {league === 'nba' ? <NbaSlate name={name} /> : <NflSlate name={name} />}
          </>
        )}
      </NameGate>
    </div>
  );
}
