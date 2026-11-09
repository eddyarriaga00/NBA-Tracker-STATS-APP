import { Link } from 'react-router-dom';
import { getTeams } from '../api/espn';
import { Card, ErrorState, PageTitle, Skeleton, TeamLogo } from '../components/ui';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';

export default function Teams() {
  const lg = useLeague();
  const { data, error, loading, reload } = useData((fresh) => getTeams(lg, { fresh }), [lg]);

  return (
    <div>
      <PageTitle eyebrow={lg.toUpperCase()}>Teams</PageTitle>
      {loading && !data ? (
        <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[260px] !rounded-2xl" />)}</div>
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        data.map((conf) => (
          <section key={conf.name} className="mb-6">
            <h2 className="mb-2 px-1 font-display text-[22px] font-bold tracking-tight">{conf.name}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {conf.divisions.map((d) => (
                <Card key={d.name} className="rise overflow-hidden">
                  <div className="px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-wide text-label-2">{d.name}</div>
                  <div className="divide-y divide-sep">
                    {d.teams.map((t) => (
                      <Link key={t.id} to={`/${lg}/team/${t.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-fill/40">
                        <TeamLogo abbr={t.abbr} size={32} />
                        <span className="flex-1 text-[16px] font-semibold">{t.name}</span>
                        <span className="num text-[14px] text-label-2">{t.record}</span>
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-label-3" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 5 7 7-7 7" /></svg>
                      </Link>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
