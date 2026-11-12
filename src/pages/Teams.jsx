import { Link } from 'react-router-dom';
import { getTeams } from '../api/espn';
import { Card, ErrorState, PageTitle, Skeleton, TeamLogo } from '../components/ui';
import { useFavorites } from '../lib/favorites';
import { Icon } from '../components/icons';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';

export default function Teams() {
  const lg = useLeague();
  const { data, error, loading, reload } = useData((fresh) => getTeams(lg, { fresh }), [lg], { remember: `teams:${lg}` });
  const { isFav, toggle } = useFavorites();
  const favTeams = (data ?? []).flatMap((c) => c.divisions.flatMap((d) => d.teams)).filter((t) => isFav(lg, t.id));
  const Row = ({ t }) => (
    <div className="flex items-center">
      <Link to={`/${lg}/team/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 transition hover:bg-fill/40">
        <TeamLogo abbr={t.abbr} size={28} className="md:h-8 md:w-8" />
        <span className="flex-1 truncate text-[15px] font-semibold md:text-[16px]">{t.name}</span>
        <span className="num text-[14px] text-label-2">{t.record}</span>
      </Link>
      <button
        onClick={() => toggle(lg, t.id)}
        aria-label={isFav(lg, t.id) ? `Unfollow ${t.name}` : `Follow ${t.name}`}
        className={`grid h-11 w-11 shrink-0 place-items-center transition active:scale-90 ${isFav(lg, t.id) ? 'text-[#ffcc00]' : 'text-label-3 hover:text-label-2'}`}
      >
        <Icon.Star filled={isFav(lg, t.id)} className="h-[18px] w-[18px]" />
      </button>
    </div>
  );

  return (
    <div>
      <PageTitle eyebrow={lg.toUpperCase()}>Teams</PageTitle>
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[260px] !rounded-2xl" />)}</div>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
        <Link to={`/${lg}/moves`} className="mb-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 active:bg-fill">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Trades &amp; moves</span>
            <span className="block text-[12.5px] text-label-2">Who was traded, signed or released, day by day</span>
          </span>
          <Icon.ChevronRight className="h-5 w-5 shrink-0 text-label-3" />
        </Link>
        <Card className="mb-6 overflow-hidden">
          <div className="px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-label-2">Your Teams</div>
          {favTeams.length ? (
            <div className="divide-y divide-sep">{favTeams.map((t) => <Row key={t.id} t={t} />)}</div>
          ) : (
            <p className="px-4 pb-3.5 pt-1 text-[13px] text-label-2">Tap ☆ on any team to follow it. Their games show first on Scores.</p>
          )}
        </Card>
        {data.map((conf) => (
          <section key={conf.name} className="mb-6">
            <h2 className="mb-2 px-1 font-display text-[19px] font-bold tracking-tight md:text-[22px]">{conf.name}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {conf.divisions.map((d) => (
                <Card key={d.name} className="rise overflow-hidden">
                  <div className="px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-label-2">{d.name}</div>
                  <div className="divide-y divide-sep">
                    {d.teams.map((t) => <Row key={t.id} t={t} />)}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
        </>
      )}
    </div>
  );
}
