import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { currentSeason, getTeam, getTeamStats, seasonLabel, seasonOptions } from '../api/espn';
import { BackButton, Card, ErrorState, Headshot, SeasonPicker, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useFavorites } from '../lib/favorites';
import { useLeague } from '../lib/league';
import { Icon } from '../components/icons';
import { BioButton } from '../components/BioSheet';
import { downloadICS, gameUrl } from '../lib/calendar';
import { useSetting } from '../lib/settings';

// Spoiler-free mode hides results from the last two days.
const RECENT_MS = 48 * 60 * 60 * 1000;
const isRecent = (e) => Date.now() - new Date(e.date).getTime() < RECENT_MS;
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';

const fmtDate = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function GameRow({ e, lg }) {
  const done = e.state === 'post';
  const [spoilerFree] = useSetting('spoilerFree');
  const hide = spoilerFree && e.state !== 'pre' && isRecent(e);
  return (
    <Link to={`/${lg}/game/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-fill/40">
      <div className="w-[80px] shrink-0 md:w-[88px]">
        <div className="text-[13px] font-semibold">{fmtDate(e.date)}</div>
        {(e.week || e.playoff) && (
          <div className={`text-[11px] ${e.playoff ? 'font-semibold text-accent' : 'text-label-2'}`}>{e.playoff ? 'Playoffs' : e.week}</div>
        )}
      </div>
      <span className="w-5 shrink-0 text-center text-[12px] text-label-2">{e.home ? 'vs' : '@'}</span>
      <TeamLogo abbr={e.opp.abbr} size={26} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold md:text-[15px]">{e.opp.name}</span>
      {hide ? (
        <span className="shrink-0 text-[13px] text-label-2">{done ? 'Final · hidden' : 'Live · hidden'}</span>
      ) : done ? (
        <span className="num shrink-0 text-[14px]">
          <span className={`mr-1.5 font-bold ${e.win ? 'text-win' : 'text-live'}`}>{e.win ? 'W' : 'L'}</span>
          {e.us}–{e.them}
        </span>
      ) : e.state === 'in' ? (
        <span className="shrink-0 text-[13px] font-semibold text-live">Live · {e.us}–{e.them}</span>
      ) : (
        <span className="shrink-0 text-right text-[13px] text-label-2">
          {fmtTime(e.date)}
          {e.broadcast && <span className="block text-[11px]">{e.broadcast}</span>}
        </span>
      )}
    </Link>
  );
}

function TeamStats({ lg, id, season }) {
  const { data, error, loading, reload } = useData((fresh) => getTeamStats(lg, id, season, { fresh }), [lg, id, season]);
  if (loading && !data) return <Skeleton className="h-[420px] !rounded-2xl" />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data.sections.length) return <Card className="py-10 text-center text-label-2">No team stats for this season yet.</Card>;
  return (
    <div className="space-y-4">
      <p className="px-1 text-[12px] text-label-2">
        {data.season} season{data.gamesPlayed ? ` · ${data.gamesPlayed} games` : ''}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.sections.map((sec) => (
          <Card key={sec.title} className="overflow-hidden">
            <div className="px-4 pb-1 pt-3 text-[15px] font-bold">{sec.title}</div>
            <div className="divide-y divide-sep">
              {sec.rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
                  <span className="text-label-2">{r.label}</span>
                  <span className="num font-semibold">
                    {r.value}
                    {r.rank && <span className="ml-1.5 text-[11px] font-normal text-label-3">{r.rank}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Schedule({ t, lg }) {
  const [showAll, setShowAll] = useState(false);
  const exportUpcoming = () =>
    downloadICS(
      t.schedule
        .filter((e) => e.state === 'pre')
        .map((e) => ({
          id: e.id,
          league: lg,
          date: e.date,
          title: `${e.home ? `${e.opp.name} at ${t.short}` : `${t.short} at ${e.opp.name}`}${e.broadcast ? ` (${e.broadcast})` : ''}`,
          url: gameUrl(lg, e.id),
        })),
      `${t.abbr}-schedule`,
      `${t.name} schedule`
    );
  const played = t.schedule.filter((e) => e.state === 'post');
  const upcoming = t.schedule.filter((e) => e.state !== 'post');
  const shownUpcoming = showAll ? upcoming : upcoming.slice(0, 8);
  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <div>
          <SectionTitle
            className="!mt-0"
            right={
              <button onClick={exportUpcoming} className="flex items-center gap-1 text-[13px] font-semibold text-accent">
                <Icon.CalendarPlus className="h-4 w-4" /> Add all to Calendar
              </button>
            }
          >
            Upcoming
          </SectionTitle>
          <Card className="divide-y divide-sep">
            {shownUpcoming.map((e) => <GameRow key={e.id} e={e} lg={lg} />)}
          </Card>
          {upcoming.length > 8 && (
            <button onClick={() => setShowAll((s) => !s)} className="mt-2 w-full rounded-xl py-2 text-[14px] font-semibold text-accent hover:bg-fill">
              {showAll ? 'Show less' : `Show all ${upcoming.length} games`}
            </button>
          )}
        </div>
      )}
      {played.length > 0 && (
        <div>
          <SectionTitle className="!mt-0">Results</SectionTitle>
          <Card className="divide-y divide-sep">
            {[...played].reverse().map((e) => <GameRow key={e.id} e={e} lg={lg} />)}
          </Card>
        </div>
      )}
      {!t.schedule.length && <Card className="py-10 text-center text-label-2">No schedule available.</Card>}
    </div>
  );
}

function Roster({ t, lg }) {
  return (
    <div className="space-y-4">
      {t.groups.map((g) => (
        <div key={g.title}>
          {t.groups.length > 1 && <SectionTitle className="!mt-0">{g.title}</SectionTitle>}
          <Card className="divide-y divide-sep">
            {g.players.map((p) => (
              <Link key={p.id} to={`/${lg}/player/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-fill/40">
                <Headshot src={p.headshot} size={36} className="md:h-[42px] md:w-[42px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{p.name}</span>
                    {p.injury && <span className="shrink-0 rounded-full bg-live/12 px-2 py-0.5 text-[10px] font-bold uppercase text-live">{p.injury}</span>}
                  </div>
                  <div className="truncate text-[12px] text-label-2">
                    {[p.jersey && `#${p.jersey}`, p.pos, p.college].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <BioButton lg={lg} id={p.id} />
                <div className="hidden shrink-0 text-right text-[12px] text-label-2 sm:block">
                  <div>{p.height}{p.weight ? ` · ${p.weight}` : ''}</div>
                  <div>{p.age ? `Age ${p.age}` : ''}{p.exp != null ? ` · ${p.exp ? `${p.exp} yr${p.exp > 1 ? 's' : ''}` : 'Rookie'}` : ''}</div>
                </div>
              </Link>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

export default function Team() {
  const { id } = useParams();
  const lg = useLeague();
  const { dark } = useTheme();
  const [tab, setTab] = useState('schedule');
  const [spoilerFree] = useSetting('spoilerFree');
  const { isFav, toggle } = useFavorites();
  const [pickedSeason, setSeason] = useState(null);
  const season = pickedSeason && seasonOptions(lg).some((o) => o.value === pickedSeason) ? pickedSeason : currentSeason(lg);
  const { data: t, error, loading, reload } = useData((fresh) => getTeam(lg, id, season, { fresh }), [lg, id, season]);

  const form = useMemo(() => (t ? t.schedule.filter((e) => e.state === 'post').slice(-5) : []), [t]);
  const next = t?.schedule.find((e) => e.state !== 'post');
  const seasonRecord = useMemo(() => {
    if (!t || t.isCurrent) return '';
    const reg = t.schedule.filter((e) => e.state === 'post' && !e.playoff);
    const w = reg.filter((e) => e.win).length;
    const po = t.schedule.filter((e) => e.state === 'post' && e.playoff);
    const pw = po.filter((e) => e.win).length;
    return `${seasonLabel(lg, season)}: ${w}-${reg.length - w}${po.length ? ` · Playoffs ${pw}-${po.length - pw}` : ''}`;
  }, [t, lg, season]);
  const c = t ? visibleColor(t.color, dark) : '#888';

  return (
    <div>
      <BackButton fallback={`/${lg}/teams`} />
      {loading && !t ? (
        <div className="space-y-3"><Skeleton className="h-[170px] !rounded-2xl" /><Skeleton className="h-[400px] !rounded-2xl" /></div>
      ) : error && !t ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="rise">
          <Card className="relative overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(120deg, ${c}40 0%, ${c}10 50%, transparent 80%)` }} />
            {t && (
              <button
                onClick={() => toggle(lg, t.id)}
                aria-label={isFav(lg, t.id) ? 'Remove from favorites' : 'Add to favorites'}
                className={`absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
                  isFav(lg, t.id) ? 'bg-[#ff9f0a] text-white' : 'bg-fill text-label-2 hover:text-label'
                }`}
              >
                <Icon.Star filled={isFav(lg, t.id)} className="h-4 w-4" />
                {isFav(lg, t.id) ? 'Favorite' : 'Follow'}
              </button>
            )}
            <div className="relative flex items-center gap-3 p-4 pr-24 md:gap-4 md:p-7 md:pr-32">
              <TeamLogo abbr={t.abbr} size={60} className="md:h-28 md:w-28" />
              <div className="min-w-0">
                <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight md:text-[34px]">{t.name}</h1>
                <div className="mt-0.5 text-[14px] font-semibold md:mt-1 md:text-[15px]">{t.record || seasonRecord}</div>
                <div className="text-[13px] text-label-2">{t.standing}</div>
                {t.coach && <div className="mt-1 text-[12px] text-label-2">Head coach: {t.coach}</div>}
              </div>
            </div>
          </Card>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {next && (
              <Link to={`/${lg}/game/${next.id}`}>
                <Card className="flex h-full items-center gap-3 px-4 py-3 transition hover:bg-card-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-label-2">{next.state === 'in' ? 'Live Now' : 'Next Game'}</div>
                    <div className="mt-1 flex items-center gap-2 text-[16px] font-semibold">
                      {next.home ? 'vs' : '@'} <TeamLogo abbr={next.opp.abbr} size={24} /> {next.opp.name}
                    </div>
                    <div className="text-[13px] text-label-2">{fmtDate(next.date)} · {fmtTime(next.date)}{next.broadcast ? ` · ${next.broadcast}` : ''}</div>
                  </div>
                </Card>
              </Link>
            )}
            {form.length > 0 && (
              <Card className="px-4 py-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-label-2">Last {form.length}</div>
                <div className="mt-2 flex gap-1.5">
                  {form.map((e) => {
                    const hidden = spoilerFree && isRecent(e);
                    return (
                      <Link
                        key={e.id}
                        to={`/${lg}/game/${e.id}`}
                        title={hidden ? 'Hidden (spoiler-free)' : `${e.home ? 'vs' : '@'} ${e.opp.abbr} ${e.us}-${e.them}`}
                        className={`grid h-9 flex-1 place-items-center rounded-lg text-[14px] font-bold text-white ${hidden ? 'bg-label-3' : e.win ? 'bg-win' : 'bg-live'}`}
                      >
                        {hidden ? '?' : e.win ? 'W' : 'L'}
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          <div className="mt-6 flex items-center gap-2">
            <Segmented
              className="flex-1"
              value={tab}
              onChange={setTab}
              options={[{ value: 'schedule', label: 'Schedule' }, { value: 'stats', label: 'Stats' }, { value: 'roster', label: 'Roster' }]}
            />
            <SeasonPicker options={seasonOptions(lg)} value={season} onChange={setSeason} />
          </div>
          <div className="mt-4">
            {tab === 'schedule' && <Schedule t={t} lg={lg} />}
            {tab === 'stats' && <TeamStats lg={lg} id={id} season={season} />}
            {tab === 'roster' && (
              <>
                {!t.isCurrent && (
                  <p className="mb-3 px-1 text-[12px] text-label-2">
                    Rosters are only available for the current season. Showing the {seasonLabel(lg, currentSeason(lg))} roster.
                  </p>
                )}
                <Roster t={t} lg={lg} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
