import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getStandings } from '../api/espn';
import { Card, ErrorState, PageTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';

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

function Table({ teams, dividers = {}, showSeed = true, title }) {
  const lg = useLeague();
  const cols = COLS[lg];
  const span = cols.length + 1;
  return (
    <Card className="rise overflow-hidden">
      {title && <div className="px-4 pt-3 text-[15px] font-bold">{title}</div>}
      <div className="no-scrollbar overflow-x-auto">
        <table className="num w-full whitespace-nowrap text-[13px] md:text-[14px]">
          <thead>
            <tr className="border-b border-sep text-[11px] font-semibold uppercase tracking-wide text-label-2">
              <th className="sticky left-0 z-10 bg-card py-2.5 pl-4 text-left font-semibold">Team</th>
              {cols.map(([h, , , desk]) => (
                <th key={h} className={`px-2 text-right last:pr-4 ${desk ? 'hidden md:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => [
              dividers[i] && <Divider key={`d${i}`} label={dividers[i]} cols={span} />,
              <tr key={t.id} className="transition-colors hover:bg-fill/50">
                <td className="sticky left-0 z-10 bg-card py-2 pl-3 pr-2 md:py-2.5">
                  <Link to={`/${lg}/team/${t.id}`} className="flex items-center gap-3">
                    {showSeed && <span className="w-5 text-right text-[13px] text-label-2">{t.seed < 99 ? t.seed : ''}</span>}
                    <TeamLogo abbr={t.abbr} size={22} className="md:h-[26px] md:w-[26px]" />
                    <span className="font-semibold">{t.name}</span>
                    {t.clinch && <span className="text-[11px] font-semibold text-label-2">{t.clinch}</span>}
                  </Link>
                </td>
                {cols.map(([h, get, cls, desk]) => (
                  <td key={h} className={`px-2 text-right last:pr-4 ${typeof cls === 'function' ? cls(t) : cls} ${desk ? 'hidden md:table-cell' : ''}`}>
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

export default function Standings() {
  const lg = useLeague();
  const [conf, setConf] = usePref(`conf:${lg}`, lg === 'nfl' ? 'American' : 'East');
  const [view, setView] = usePref('nflStandingsView', 'division');
  const { data, error, loading, reload } = useData((fresh) => getStandings(lg, { fresh }), [lg]);
  const current = data?.find((c) => c.name?.startsWith(conf)) ?? data?.[0];

  const confOptions =
    lg === 'nfl'
      ? [{ value: 'American', label: 'AFC' }, { value: 'National', label: 'NFC' }]
      : [{ value: 'East', label: 'Eastern' }, { value: 'West', label: 'Western' }];

  return (
    <div>
      <PageTitle eyebrow={lg.toUpperCase()}>Standings</PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Segmented className="w-full md:w-72" value={conf} onChange={setConf} options={confOptions} />
        {lg === 'nfl' && (
          <Segmented
            className="w-full md:w-72"
            value={view}
            onChange={setView}
            options={[{ value: 'division', label: 'Divisions' }, { value: 'playoff', label: 'Playoff Picture' }]}
          />
        )}
      </div>

      {loading && !data ? (
        <Skeleton className="h-[640px] !rounded-2xl" />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : lg === 'nfl' && view === 'division' ? (
        <div key={conf} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {current?.divisions.map((d) => <Table key={d.name} title={d.name} teams={d.teams} />)}
        </div>
      ) : (
        <div key={`${conf}${view}`}>
          <Table
            teams={current?.teams ?? []}
            dividers={
              lg === 'nfl'
                ? { 0: 'Division Leaders', 4: 'Wild Card', 7: 'In the Hunt' }
                : { 0: 'Playoffs', 6: 'Play-In', 10: 'Lottery' }
            }
          />
        </div>
      )}
      <p className="mt-3 px-1 text-[12px] text-label-2">
        {lg === 'nfl'
          ? 'Seeds 1–4 are division winners, 5–7 are wild cards. Seed 1 gets a first-round bye.'
          : 'Seeds 1–6 make the playoffs. Seeds 7–10 play in the Play-In Tournament.'}
      </p>
    </div>
  );
}
