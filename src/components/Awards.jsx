import { useState } from 'react';
import { Link } from 'react-router-dom';
import { currentSeason, getAwards, getLatestAwards, seasonLabel, seasonOptions } from '../api/espn';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';
import { BioButton } from './BioSheet';
import { Card, ErrorState, Headshot, SeasonPicker, Skeleton, TeamLogo } from './ui';

function Winner({ w, lg, big }) {
  const body = (
    <>
      <Headshot src={w.headshot} size={big ? 56 : 36} />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-semibold ${big ? 'text-[17px]' : 'text-[14px]'}`}>{w.name || 'Unknown'}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-label-2">
          {w.teamAbbr && <TeamLogo abbr={w.teamAbbr} size={14} league={lg} />}
          {[w.teamAbbr, w.isCoach ? 'Head Coach' : w.pos].filter(Boolean).join(' · ')}
        </div>
      </div>
    </>
  );
  return (
    <div className="flex items-center gap-3">
      {w.id && !w.isCoach ? (
        <Link to={`/${lg}/player/${w.id}`} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {!w.isCoach && <BioButton lg={lg} id={w.id} />}
    </div>
  );
}

export default function Awards() {
  const lg = useLeague();
  const cur = currentSeason(lg);
  const [picked, setPicked] = useState(null);
  // Default: the latest season that already has awards (this season's are given after it ends).
  const latest = useData((fresh) => getLatestAwards(lg, { fresh }), [lg]);
  const season = picked ?? latest.data?.season ?? null;
  const chosen = useData(
    (fresh) => (season && season !== latest.data?.season ? getAwards(lg, season, { fresh }) : Promise.resolve(latest.data?.awards ?? null)),
    [lg, season, latest.data?.season]
  );
  const awards = picked && picked !== latest.data?.season ? chosen.data : latest.data?.awards;
  const loading = latest.loading || (picked && chosen.loading && !chosen.data);
  const error = latest.error || chosen.error;

  const major = (awards ?? []).filter((a) => !a.team);
  const teams = (awards ?? []).filter((a) => a.team);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <span className="text-[13px] text-label-2">{season ? `${seasonLabel(lg, season)} season` : ' '}</span>
        <SeasonPicker
          options={seasonOptions(lg, 'awards')}
          value={season ?? cur - 1}
          onChange={setPicked}
        />
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[92px] !rounded-2xl" />)}
        </div>
      ) : error && !awards ? (
        <ErrorState error={error} onRetry={latest.reload} />
      ) : !awards?.length ? (
        <Card className="px-6 py-10 text-center">
          <div className="text-[16px] font-semibold">No awards yet for {seasonLabel(lg, season ?? cur)}</div>
          <p className="mt-1 text-[13px] text-label-2">Awards are handed out after the season ends. Pick an earlier season.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {major.map((a, i) => (
              <Card key={a.id} className={`rise px-4 py-3.5 ${i === 0 ? 'md:col-span-2' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-[16px]" aria-hidden>🏆</span>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold">{a.name}</div>
                    {a.description && a.description !== a.name && <div className="truncate text-[11.5px] text-label-2">{a.description}</div>}
                  </div>
                </div>
                {a.winners.map((w) => <Winner key={w.id ?? w.name} w={w} lg={lg} big={i === 0} />)}
              </Card>
            ))}
          </div>
          {teams.length > 0 && (
            <>
              <h2 className="mb-2 mt-7 px-1 font-display text-[19px] font-bold tracking-tight md:text-[22px]">Teams & honors</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {teams.map((a) => (
                  <Card key={a.id} className="overflow-hidden">
                    <div className="px-4 pb-1 pt-3 text-[14px] font-bold">{a.name}</div>
                    <div className="divide-y divide-sep">
                      {a.winners.map((w) => (
                        <div key={w.id ?? w.name} className="px-4 py-2">
                          <Winner w={w} lg={lg} />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
