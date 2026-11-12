import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { currentSeason, firstSeason, getTeam, getTeamInfo, getTeamSeasons, getTeamStats, getTeamVenue, seasonLabel, seasonOptions } from '../api/espn';
import { TeamMoves } from '../components/Moves';
import Comments, { useCommentCounts } from '../components/Comments';
import { BackButton, Card, ErrorState, Headshot, SeasonPicker, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { visibleColor } from '../lib/color';
import { useFavorites } from '../lib/favorites';
import { useLeague } from '../lib/league';
import { Icon } from '../components/icons';
import { BioButton } from '../components/BioSheet';
import { downloadICS, gameUrl } from '../lib/calendar';
import { useSetting } from '../lib/settings';
import { franchise, titles, wonTitle, yearRuns } from '../lib/champions';
import { useSeen } from '../lib/useSeen';

// Spoiler-free mode hides results from the last two days.
const RECENT_MS = 48 * 60 * 60 * 1000;
const isRecent = (e) => Date.now() - new Date(e.date).getTime() < RECENT_MS;
import { useTheme } from '../lib/theme';
import { useData } from '../lib/useData';

const fmtDate = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
// A game with no time yet is stored as midnight Eastern, so its day is read in Eastern time.
const dayOf = (e) => (e.timeValid === false ? new Date(e.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : fmtDate(e.date));
const timeOf = (e) => (e.timeValid === false ? 'Time TBD' : fmtTime(e.date));

function GameRow({ e, lg }) {
  const done = e.state === 'post';
  const [spoilerFree] = useSetting('spoilerFree');
  const hide = spoilerFree && e.state !== 'pre' && isRecent(e) && !e.noScore;
  return (
    <Link to={`/${lg}/game/${e.id}`} className="flex items-center gap-2.5 px-4 py-2.5 transition hover:bg-fill/40 active:bg-fill md:gap-3">
      <div className="w-[86px] shrink-0 md:w-[120px]">
        <div className="text-[13px] font-semibold">{dayOf(e)}</div>
        {(e.week || e.playoff) && (
          <div className={`text-[11px] leading-tight ${e.playoff ? 'font-semibold text-accent' : 'text-label-2'}`}>
            {e.playoff ? 'Playoffs' : e.week}
            {e.playoff && e.round && e.round !== 'Playoffs' && <span className="block whitespace-nowrap font-medium">{e.round}</span>}
          </div>
        )}
      </div>
      <span className="w-5 shrink-0 text-center text-[12px] text-label-2">{e.home ? 'vs' : '@'}</span>
      <TeamLogo abbr={e.opp.abbr} size={26} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold md:text-[15px]">{e.opp.name}</span>
      {hide ? (
        <span className="shrink-0 text-[13px] text-label-2">{done ? 'Final' : 'Live'}</span>
      ) : done && e.noScore ? (
        <span className="shrink-0 text-[12.5px] text-label-3">{e.offLabel || 'No score on record'}</span>
      ) : done ? (
        <span className="num shrink-0 text-[14px]">
          <span className={`mr-1.5 font-bold ${e.win ? 'text-win' : 'text-live'}`}>{e.win ? 'W' : 'L'}</span>
          {e.us}–{e.them}
        </span>
      ) : e.state === 'in' ? (
        <span className="shrink-0 text-[13px] font-semibold text-live">Live · {e.us}–{e.them}</span>
      ) : (
        <span className="shrink-0 text-right text-[13px] text-label-2">
          {timeOf(e)}
          {e.broadcast && <span className="block text-[11px]">{e.broadcast}</span>}
        </span>
      )}
    </Link>
  );
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const signed = (n, digits = 0) => `${n > 0 ? '+' : ''}${Number(n).toFixed(digits)}`;

/** The season in a handful of numbers: two rows of four on a phone, one row on a wide screen. */
function TeamFacts({ lg, data }) {
  if (!data?.record || !data.games) return null;
  // Old seasons come without division and conference records; ESPN sends "0-0" for those.
  const real = (v) => v && v !== '0-0' && v !== '0-0-0';
  const tiles = [
    data.home && ['Home', data.home],
    data.road && ['Away', data.road],
    real(data.division) && ['vs Division', data.division],
    real(data.conference) && ['vs Conference', data.conference],
    data.ppg != null && ['Points / game', data.ppg.toFixed(1)],
    data.oppPpg != null && ['Allowed / game', data.oppPpg.toFixed(1)],
    data.diff != null && [lg === 'nba' ? 'Margin / game' : 'Point diff', signed(data.diff, lg === 'nba' ? 1 : 0), data.diff > 0 ? 'text-win' : data.diff < 0 ? 'text-live' : ''],
    data.rank && ['In conference', ordinal(data.rank)],
  ].filter(Boolean).slice(0, 8);
  if (tiles.length < 4) return null;
  return (
    <Card className="mt-3 grid grid-cols-4 gap-px overflow-hidden bg-sep md:grid-cols-8">
      {tiles.map(([label, value, cls]) => (
        <div key={label} className="bg-card px-1 py-2.5 text-center">
          <div className={`num text-[16px] font-bold leading-tight md:text-[18px] ${cls ?? ''}`}>{value}</div>
          <div className="mt-0.5 truncate text-[10.5px] text-label-2 md:text-[11px]">{label}</div>
        </div>
      ))}
    </Card>
  );
}

/** Where the franchise came from, what it has won, where it plays, and how recent seasons went. */
function History({ lg, id, t }) {
  const [ref, near] = useSeen(500);
  const cur = currentSeason(lg);
  const first = firstSeason(lg, 'team');
  const f = franchise(lg, id);
  // No further back than the franchise itself (ESPN files some older seasons under a team that inherited the number).
  const oldest = Math.max(first, f ? (lg === 'nba' ? f.first + 1 : f.first) : first);
  const [rows, setRows] = useState([]);
  const [asked, setAsked] = useState(0); // seasons requested so far
  const [want, setWant] = useState(10);
  const [busy, setBusy] = useState(false);
  // Loads once the section is near the screen, ten seasons at a time.
  useEffect(() => {
    if (!near || asked >= want) return;
    const years = [];
    for (let y = cur - 1 - asked; y >= oldest && years.length < want - asked; y--) years.push(y);
    if (!years.length) { setAsked(want); return; }
    let on = true;
    setBusy(true);
    getTeamSeasons(lg, id, years)
      .then((more) => { if (on) setRows((r) => [...r, ...more]); })
      .catch(() => {})
      .finally(() => { if (on) { setAsked(want); setBusy(false); } });
    return () => { on = false; };
  }, [near, want, asked, lg, id, cur, oldest]);
  const { data: venue } = useData(() => (near ? getTeamVenue(lg, id) : Promise.resolve(null)), [lg, id, near, 'venue']);

  const won = titles(lg, id);
  const facts = [
    f && ['First season', seasonLabel(lg, lg === 'nba' ? f.first + 1 : f.first)],
    f?.was && ['Began as', f.was],
    [lg === 'nba' ? 'NBA titles' : 'Super Bowl wins', won.length ? `${won.length}` : 'None yet', won.length ? `${yearRuns(won)}${lg === 'nfl' ? (won.length === 1 ? ' season' : ' seasons') : ''}` : ''],
    venue && [lg === 'nba' ? 'Home arena' : 'Home stadium', venue.name, [venue.place, lg === 'nfl' && (venue.indoor ? 'Indoors' : 'Outdoors'), lg === 'nfl' && (venue.grass ? 'Grass' : 'Turf')].filter(Boolean).join(' · ')],
  ].filter(Boolean);
  const more = cur - 1 - asked >= oldest;

  return (
    <div ref={ref}>
      <SectionTitle>History</SectionTitle>
      <Card className="overflow-hidden">
        {venue?.image && (
          <div className="relative h-[112px] bg-fill md:h-[170px]">
            <img src={venue.image} alt={venue.name} loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-2 left-3.5 right-3.5 truncate text-[13px] font-semibold text-white md:left-4">{venue.name}</div>
          </div>
        )}
        <div className="divide-y divide-sep">
          {facts.map(([k, v, sub]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 md:px-4">
              <span className="shrink-0 text-[13px] text-label-2">{k}</span>
              <span className="min-w-0 text-right">
                <span className="block text-[14px] font-semibold">{v}</span>
                {sub && <span className="block text-[12px] leading-snug text-label-2">{sub}</span>}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3 overflow-hidden">
        <div className="flex items-baseline justify-between px-3.5 pb-1 pt-3 md:px-4">
          <span className="text-[15px] font-bold">Past seasons</span>
          <span className="text-[11.5px] text-label-3">Tap a season to open it</span>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-sep">
            {rows.map((r) => {
              const champ = wonTitle(lg, r.year, id);
              return (
                <Link
                  key={r.year}
                  to={`/${lg}/team/${id}?season=${r.year}`}
                  onClick={() => window.scrollTo(0, 0)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-fill/40 active:bg-fill md:px-4 ${champ ? 'bg-[color-mix(in_srgb,#ffd60a_11%,var(--card))]' : ''}`}
                >
                  <span className="w-[62px] shrink-0 text-[13.5px] font-semibold text-accent">{seasonLabel(lg, r.year)}</span>
                  <span className="num w-[52px] shrink-0 text-[14px] font-bold">{r.record}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-label-2">
                      {champ ? <span className="font-semibold text-[#806000] dark:text-[#ffd60a]">🏆 Champions · </span> : null}
                      {r.rank ? (champ ? `#${r.rank} seed` : `${ordinal(r.rank)} in conference`) : ''}
                    </span>
                    {r.home && r.road && <span className="num block truncate text-[11.5px] text-label-3">{r.home} home · {r.road} away</span>}
                  </span>
                  <svg aria-hidden width="8" height="13" viewBox="0 0 8 13" className="shrink-0 text-label-3">
                    <path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-3.5 pb-3 pt-1 md:px-4">
            {busy || !near || asked < want ? <Skeleton className="h-[220px]" /> : <p className="py-4 text-center text-[13px] text-label-2">No past seasons on record for the {t.short ?? t.name}.</p>}
          </div>
        )}
        {rows.length > 0 && more && (
          <button onClick={() => setWant((n) => n + 10)} disabled={busy} className="w-full border-t border-sep py-2.5 text-[13.5px] font-semibold text-accent active:bg-fill disabled:opacity-50">
            {busy ? 'Loading…' : 'Show earlier seasons'}
          </button>
        )}
      </Card>
      <p className="mt-1.5 px-1 text-[11.5px] leading-snug text-label-3">
        {lg === 'nba' ? 'Titles count the NBA and its first three seasons as the BAA.' : 'Titles are Super Bowls, listed by season; league championships from before the Super Bowl aren’t counted.'} Season records go back to {seasonLabel(lg, first)}.
      </p>
    </div>
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
      {t.pastRoster && (
        <p className="px-1 text-[12.5px] text-label-2">
          {t.groups.length ? `Everyone who played for the ${t.short} in ${t.season}.` : `ESPN doesn’t have player stats for the ${t.short} in ${t.season}.`}
        </p>
      )}
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
                {p.line && <div className="num shrink-0 text-right text-[12.5px] font-semibold text-label-2">{p.line}</div>}
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
  // One comment thread per team, shared by every season of its page.
  const room = `${lg}:team:${id}`;
  const said = useCommentCounts([room])[room] ?? 0;
  const toComments = () => document.getElementById('team-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const [params] = useSearchParams();
  const [pickedSeason, setSeason] = useState(() => Number(params.get('season')) || null); // links from old playoff results
  // A link to another team or season while this page is already open.
  const wanted = params.get('season');
  useEffect(() => { setSeason(Number(wanted) || null); }, [lg, id, wanted]);
  const season = pickedSeason && seasonOptions(lg, 'team').some((o) => o.value === pickedSeason) ? pickedSeason : currentSeason(lg);
  const { data: info } = useData((fresh) => getTeamInfo(lg, id, season, { fresh }), [lg, id, season], { remember: `teaminfo:${lg}:${id}:${season}` });
  const { data: t, error, loading, reload } = useData((fresh) => getTeam(lg, id, season, { fresh }), [lg, id, season], { remember: `team:${lg}:${id}:${season}` });
  const view = tab === 'moves' && season !== currentSeason(lg) ? 'schedule' : tab; // moves are only listed for this season

  const form = useMemo(() => (t ? t.schedule.filter((e) => e.state === 'post' && !e.noScore).slice(-5) : []), [t]);
  const next = t?.schedule.find((e) => e.state !== 'post');
  const seasonRecord = useMemo(() => {
    if (!t || t.isCurrent) return '';
    const played = t.schedule.filter((e) => e.state === 'post' && !e.noScore);
    const reg = played.filter((e) => !e.playoff);
    const w = reg.filter((e) => e.win).length;
    const po = played.filter((e) => e.playoff);
    const pw = po.filter((e) => e.win).length;
    // ESPN's old schedules have games with no score; its record sheet is the reliable count.
    const record = info?.games ? info.record : reg.length ? `${w}-${reg.length - w}` : '';
    if (!record && !po.length) return seasonLabel(lg, season);
    return `${seasonLabel(lg, season)}: ${record}${po.length ? ` · Playoffs ${pw}-${po.length - pw}` : ''}`;
  }, [t, lg, season, info]);
  // A season the team has nothing on record for (before it existed, or a gap year).
  const emptySeason = !!t && !t.isCurrent && !t.schedule.length && !info?.games;
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
                  isFav(lg, t.id) ? 'bg-[#ffcc00] text-black' : 'bg-fill text-label-2 hover:text-label'
                }`}
              >
                <Icon.Star filled={isFav(lg, t.id)} className="h-4 w-4" />
                {isFav(lg, t.id) ? 'Favorite' : 'Follow'}
              </button>
            )}
            <div className="relative flex items-center gap-3 p-4 md:gap-4 md:p-7">
              <TeamLogo abbr={t.abbr} size={60} className="md:h-28 md:w-28" />
              <div className="min-w-0">
                <h1 className="pr-[104px] font-display text-[22px] font-bold leading-tight tracking-tight md:pr-28 md:text-[34px]">{t.name}</h1>
                <div className="mt-0.5 text-[14px] font-semibold md:mt-1 md:text-[15px]">{t.record || seasonRecord}</div>
                <div className="text-[13px] text-label-2">{t.standing}</div>
                {/* ESPN only knows today's coach, so don't show it on past seasons. */}
                {t.coach && t.isCurrent && <div className="mt-1 text-[12px] text-label-2">Head coach: {t.coach}</div>}
                {/* The comments sit under the schedule; this jumps to them. */}
                <button onClick={toComments} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[12px] font-semibold text-accent active:opacity-70">
                  <Icon.Chat className="h-3.5 w-3.5" />
                  {said ? `${said} ${said === 1 ? 'comment' : 'comments'}` : 'Comment'}
                </button>
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
                    <div className="text-[13px] text-label-2">{dayOf(next)} · {timeOf(next)}{next.broadcast ? ` · ${next.broadcast}` : ''}</div>
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

          <TeamFacts lg={lg} data={info} />

          <div className="mt-6 flex items-center gap-2">
            <Segmented
              className="flex-1"
              value={view}
              onChange={setTab}
              options={[{ value: 'schedule', label: 'Games' }, { value: 'stats', label: 'Stats' }, { value: 'roster', label: 'Roster' }, ...(Number(season) === currentSeason(lg) ? [{ value: 'moves', label: 'Moves' }] : [])]}
            />
            <SeasonPicker options={seasonOptions(lg, 'team')} value={season} onChange={setSeason} />
          </div>
          <div className="mt-4">
            {emptySeason && (
              <Card className="mb-3 px-4 py-6 text-center">
                <div className="text-[15px] font-semibold">Nothing on record for {seasonLabel(lg, season)}</div>
                <p className="mx-auto mt-1 max-w-sm text-[13px] text-label-2">ESPN has no games for the {t.short ?? t.name} that season. Pick another season above.</p>
              </Card>
            )}
            {!emptySeason && view === 'schedule' && <Schedule t={t} lg={lg} />}
            {!emptySeason && view === 'stats' && <TeamStats lg={lg} id={id} season={season} />}
            {!emptySeason && view === 'moves' && <TeamMoves lg={lg} id={id} />}
            {!emptySeason && view === 'roster' && (
              <>
                <Roster t={t} lg={lg} />
              </>
            )}
          </div>

          <History lg={lg} id={id} t={t} />

          <div id="team-comments" className="scroll-mt-16">
            <SectionTitle right={said ? <span className="text-[13px] text-label-2">{said}</span> : null}>Comments</SectionTitle>
            <Card className="overflow-hidden">
              <Comments key={room} room={room} emptyText={`No comments yet. Say something about the ${t.short ?? t.name}.`} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
