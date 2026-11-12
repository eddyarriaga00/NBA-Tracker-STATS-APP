import { useState } from 'react';
import { Link } from 'react-router-dom';
import { currentSeason, getStandings, seasonLabel, seasonOptions, teamHref } from '../api/espn';
import { Card, ErrorState, PageTitle, SeasonPicker, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';
import Bracket from '../components/Bracket';

function usePref(key, initial) {
  const [v, setV] = useState(() => {
    try { return localStorage.getItem(key) || initial; } catch { return initial; }
  });
  const set = (x) => {
    setV(x);
    try { localStorage.setItem(key, x); } catch { /* ignore */ }
  };
  return [v, set];
}

function Divider({ label, cols }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 pb-1 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-label-2">
          <span>{label}</span>
          <span className="h-px flex-1 bg-sep" />
        </div>
      </td>
    </tr>
  );
}

const signed = (d) => {
  const n = parseFloat(d);
  return { text: `${n > 0 && !String(d).startsWith('+') ? '+' : ''}${d ?? ''}`, cls: n > 0 ? 'text-win' : n < 0 ? 'text-live' : 'text-label-2' };
};

/** Column sets per league. Each: [header, render(team), className, desktopOnly] */
const COLS = {
  nba: [
    ['W', (t) => t.wins, 'font-semibold'],
    ['L', (t) => t.losses, 'font-semibold'],
    ['Pct', (t) => t.pct, 'text-label-2'],
    ['GB', (t) => t.gb, 'text-label-2'],
    ['L10', (t) => t.l10, 'text-label-2'],
    ['Strk', (t) => t.streak, (t) => (t.streak?.startsWith('W') ? 'font-semibold text-win' : 'font-semibold text-live')],
    ['Home', (t) => t.home, 'text-label-2', true],
    ['Away', (t) => t.road, 'text-label-2', true],
    ['Diff', (t) => signed(t.diff).text, (t) => signed(t.diff).cls, true],
  ],
  nfl: [
    ['W', (t) => t.wins, 'font-semibold'],
    ['L', (t) => t.losses, 'font-semibold'],
    ['T', (t) => t.ties, 'text-label-2'],
    ['Pct', (t) => t.pct, 'text-label-2'],
    ['Diff', (t) => signed(t.diff).text, (t) => signed(t.diff).cls],
    ['Strk', (t) => t.streak, (t) => (t.streak?.startsWith('W') ? 'font-semibold text-win' : 'font-semibold text-live')],
    ['PF', (t) => t.pf, 'text-label-2', true],
    ['PA', (t) => t.pa, 'text-label-2', true],
    ['Home', (t) => t.home, 'text-label-2', true],
    ['Away', (t) => t.road, 'text-label-2', true],
    ['Div', (t) => t.div, 'text-label-2', true],
  ],
};

function Table({ teams, dividers = {}, showSeed = true, title, season }) {
  const lg = useLeague();
  const cols = COLS[lg];
  const span = cols.length + 1;
  // The last column a phone shows (the ones after it are desktop-only) needs the card's right margin.
  const lastOnPhone = cols.reduce((n, c, i) => (c[3] ? n : i), 0);
  const pad = (i) => `px-1.5 md:px-2 last:pr-4 ${i === lastOnPhone ? 'max-md:pr-3.5' : ''}`;
  return (
    <Card className="rise overflow-hidden">
      {title && <div className="px-4 pt-3 text-[15px] font-bold">{title}</div>}
      <div className="no-scrollbar overflow-x-auto">
        <table className="num w-full whitespace-nowrap text-[13px] md:text-[14px]">
          <thead>
            <tr className="border-b border-sep text-[11px] font-semibold uppercase tracking-wide text-label-2">
              <th className="sticky left-0 z-10 bg-card py-2.5 pl-4 text-left font-semibold">Team</th>
              {cols.map(([h, , , desk], i) => (
                <th key={h} className={`${pad(i)} text-right ${desk ? 'hidden md:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => [
              dividers[i] && <Divider key={`d${i}`} label={dividers[i]} cols={span} />,
              <tr key={t.id} className="transition-colors hover:bg-fill/50">
                <td className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 md:py-2.5">
                  <Link to={teamHref(lg, t.id, season)} className="flex items-center gap-2.5 md:gap-3">
                    {showSeed && <span className="w-5 text-right text-[13px] text-label-2">{t.seed < 99 ? t.seed : ''}</span>}
                    <TeamLogo abbr={t.abbr} size={22} className="md:h-[26px] md:w-[26px]" />
                    <span className="font-semibold">{t.name}</span>
                    {t.clinch && <span className="text-[11px] font-semibold text-label-2">{t.clinch}</span>}
                  </Link>
                </td>
                {cols.map(([h, get, cls, desk], i) => (
                  <td key={h} className={`${pad(i)} text-right ${typeof cls === 'function' ? cls(t) : cls} ${desk ? 'hidden md:table-cell' : ''}`}>
                    {get(t)}
                  </td>
                ))}
              </tr>,
            ])}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Playoff lines change by era: the NBA Play-In started in 2020-21 (before that
 * the top 8 made it); the NFL took 7 per conference from 2020, 6 before (4
 * division winners from 2002, 3 before that). Some old NFL seasons have no
 * usable seeds in ESPN's data, so those are just ranked by record.
 */
function playoffFormat(lg, season, teams) {
  if (lg === 'nba') {
    return season >= 2021
      ? { teams, dividers: { 0: 'Playoffs', 6: 'Play-In', 10: 'Lottery' }, note: 'Seeds 1–6 make the playoffs. Seeds 7–10 play in the Play-In Tournament.' }
      : { teams, dividers: { 0: 'Playoffs', 8: 'Lottery' }, note: 'The top 8 in each conference made the playoffs (the Play-In started in 2020-21).' };
  }
  const n = teams.length;
  const seeded = teams.filter((t) => t.seed < 99).map((t) => t.seed).sort((a, b) => a - b);
  const reliable = seeded.length === n && seeded.every((x, i) => x === i + 1);
  if (season >= 2020) return { teams, dividers: { 0: 'Division Leaders', 4: 'Wild Card', 7: 'In the Hunt' }, note: 'Seeds 1–4 are division winners, 5–7 are wild cards. Seed 1 gets a first-round bye.' };
  const leaders = season >= 2002 ? 4 : 3;
  const note = `Six teams per conference made the playoffs: ${leaders} division winners and ${6 - leaders} wild cards. The top 2 seeds got byes.`;
  if (reliable) return { teams, reliable, dividers: { 0: 'Division Leaders', [leaders]: 'Wild Card', 6: 'In the Hunt' }, note };
  const byRecord = [...teams].sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));
  return { teams: byRecord, dividers: {}, note: `${note} Ranked by record here (ESPN doesn’t have seeds for this season).` };
}

export default function Standings() {
  const lg = useLeague();
  const [conf, setConf] = usePref(`conf:${lg}`, lg === 'nfl' ? 'American' : 'East');
  const [rawView, setView] = usePref(`standingsView:${lg}`, lg === 'nfl' ? 'division' : 'table');
  const valid = lg === 'nfl' ? ['division', 'playoff', 'bracket'] : ['table', 'bracket'];
  const view = valid.includes(rawView) ? rawView : valid[0];
  const [pickedSeason, setSeason] = useState(null);
  const season = pickedSeason && seasonOptions(lg, 'standings').some((o) => o.value === pickedSeason) ? pickedSeason : currentSeason(lg);
  const { data, error, loading, reload } = useData((fresh) => getStandings(lg, season, { fresh }), [lg, season], { remember: `standings:${lg}:${season}` });
  const current = data?.find((c) => c.name?.startsWith(conf)) ?? data?.[0];
  const era = playoffFormat(lg, season, current?.teams ?? []);
  // Old NFL seasons where ESPN's seed numbers are league-wide or missing: don't show them.
  const seedsOk = lg === 'nba' || season >= 2020 || (data ?? []).every((c) => playoffFormat(lg, season, c.teams).reliable);

  const confOptions =
    lg === 'nfl'
      ? [{ value: 'American', label: 'AFC' }, { value: 'National', label: 'NFC' }]
      : [{ value: 'East', label: 'Eastern' }, { value: 'West', label: 'Western' }];

  return (
    <div>
      <PageTitle
        eyebrow={`${lg.toUpperCase()} · ${seasonLabel(lg, season)}`}
        right={<SeasonPicker options={seasonOptions(lg, 'standings')} value={season} onChange={setSeason} />}
      >
        Standings
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {view !== 'bracket' && <Segmented className="w-full md:w-72" value={conf} onChange={setConf} options={confOptions} />}
        <Segmented
          className="w-full md:w-96"
          value={view}
          onChange={setView}
          options={
            lg === 'nfl'
              ? [{ value: 'division', label: 'Divisions' }, { value: 'playoff', label: 'Playoff Picture' }, { value: 'bracket', label: 'Bracket' }]
              : [{ value: 'table', label: 'Standings' }, { value: 'bracket', label: 'Bracket' }]
          }
        />
      </div>

      {loading && !data ? (
        <Skeleton className="h-[640px] !rounded-2xl" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : view === 'bracket' ? (
        <Bracket key={`${lg}:${season}`} confs={data} season={season} />
      ) : lg === 'nfl' && view === 'division' ? (
        <div key={conf} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {current?.divisions.map((d) => <Table key={d.name} title={d.name} teams={d.teams} showSeed={seedsOk} season={season} />)}
        </div>
      ) : (
        <div key={`${conf}${view}`}>
          <Table teams={era.teams} dividers={era.dividers} showSeed={seedsOk} season={season} />
        </div>
      )}
      {view !== 'bracket' && <p className="mt-3 px-1 text-[12px] text-label-2">
        {era.note}
      </p>}
    </div>
  );
}
