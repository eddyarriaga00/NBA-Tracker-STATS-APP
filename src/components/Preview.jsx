import { useState } from 'react';
import { Link } from 'react-router-dom';
import { visibleColor } from '../lib/color';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';
import { Card, Headshot, SectionTitle, TeamLogo } from './ui';

const ml = (v) => (v == null ? '–' : v > 0 ? `+${v}` : String(v));
const shortDate = (d) => (d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

function Matchup({ preview, home, away }) {
  const { dark } = useTheme();
  const { predictor, odds } = preview;
  if (!predictor && !odds) return null;
  const a = visibleColor(away.color, dark);
  const h = visibleColor(home.color, dark);
  return (
    <>
      <SectionTitle>Matchup</SectionTitle>
      <Card className="px-4 py-3.5">
        {predictor && (
          <div>
            <div className="flex items-center justify-between text-[14px]">
              <span className="flex items-center gap-1.5">
                <TeamLogo abbr={away.abbr} size={20} />
                <span className="font-semibold">{away.abbr}</span>
                <span className="num font-bold">{predictor.away.toFixed(1)}%</span>
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-label-2">Win chance</span>
              <span className="flex items-center gap-1.5">
                <span className="num font-bold">{predictor.home.toFixed(1)}%</span>
                <span className="font-semibold">{home.abbr}</span>
                <TeamLogo abbr={home.abbr} size={20} />
              </span>
            </div>
            <div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full">
              <div className="rounded-l-full" style={{ width: `${predictor.away}%`, background: a }} />
              <div className="flex-1 rounded-r-full" style={{ background: h }} />
            </div>
            <div className="mt-1.5 text-[11px] text-label-3">ESPN Matchup Predictor</div>
          </div>
        )}
        {odds && (odds.details || odds.overUnder != null) && (
          <div className={`grid grid-cols-3 gap-2 text-center ${predictor ? 'mt-3.5 border-t border-sep pt-3' : ''}`}>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-label-2">Spread</div>
              <div className="num mt-0.5 text-[15px] font-semibold">{odds.details || '–'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-label-2">Total</div>
              <div className="num mt-0.5 text-[15px] font-semibold">{odds.overUnder ?? '–'}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-label-2">Moneyline</div>
              <div className="num mt-0.5 text-[13px] font-semibold leading-snug">
                <div>{away.abbr} {ml(odds.awayML)}</div>
                <div>{home.abbr} {ml(odds.homeML)}</div>
              </div>
            </div>
            {odds.provider && <div className="col-span-3 text-[11px] text-label-3">Odds via {odds.provider}</div>}
          </div>
        )}
      </Card>
    </>
  );
}

const numDate = (d) => {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : `${x.getMonth() + 1}/${x.getDate()}`;
};

function LastFive({ preview, home, away }) {
  const lg = useLeague();
  const rows = [away, home]
    .map((t) => ({ t, games: preview.lastFive.find((x) => x.teamId === t.id)?.games ?? [] }))
    .filter((r) => r.games.length);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle>Last 5 Games</SectionTitle>
      <Card className="divide-y divide-sep">
        {rows.map(({ t, games }) => (
          <div key={t.id} className="flex items-start gap-3 px-4 py-3">
            <TeamLogo abbr={t.abbr} size={24} className="mt-2" />
            <span className="mt-2.5 w-10 text-[14px] font-semibold">{t.abbr}</span>
            <div className="flex flex-1 gap-1.5">
              {[...games].reverse().map((g) => (
                <Link
                  key={g.id}
                  to={`/${lg}/game/${g.id}`}
                  title={`${g.atVs} ${g.opp} ${g.score}`}
                  className="flex flex-1 flex-col items-center gap-1 transition active:scale-95"
                >
                  <span
                    className={`flex h-10 w-full flex-col items-center justify-center rounded-lg leading-tight text-white ${
                      g.result === 'W' ? 'bg-win' : g.result === 'L' ? 'bg-live' : 'bg-label-3'
                    }`}
                  >
                    <span className="text-[13px] font-bold">{g.result || '–'}</span>
                    <span className="text-[9.5px] font-semibold opacity-90">{g.opp}</span>
                  </span>
                  <span className="num text-[10.5px] text-label-2">{numDate(g.date)}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

function Series({ preview }) {
  const lg = useLeague();
  const s = preview.series;
  if (!s?.events?.length) return null;
  return (
    <>
      <SectionTitle right={<span className="text-[12px] text-label-2">{s.summary}</span>}>Season Series</SectionTitle>
      <Card className="divide-y divide-sep">
        {s.events.map((e) => (
          <Link key={e.id} to={`/${lg}/game/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 text-[14px] transition hover:bg-fill/40">
            <span className="w-14 shrink-0 text-[13px] text-label-2">{shortDate(e.date)}</span>
            {e.away && e.home ? (
              <span className="num flex flex-1 items-center gap-2">
                <TeamLogo abbr={e.away.abbr} size={18} />
                <span className={e.state === 'post' && !e.away.winner ? 'text-label-2' : 'font-semibold'}>
                  {e.away.abbr}{e.state !== 'pre' && e.away.score != null ? ` ${e.away.score}` : ''}
                </span>
                <span className="text-label-3">@</span>
                <TeamLogo abbr={e.home.abbr} size={18} />
                <span className={e.state === 'post' && !e.home.winner ? 'text-label-2' : 'font-semibold'}>
                  {e.home.abbr}{e.state !== 'pre' && e.home.score != null ? ` ${e.home.score}` : ''}
                </span>
              </span>
            ) : (
              <span className="flex-1" />
            )}
            <span className="shrink-0 text-[12px] text-label-2">
              {e.state === 'post' ? 'Final' : e.state === 'in' ? 'Live' : 'Upcoming'}
            </span>
          </Link>
        ))}
      </Card>
    </>
  );
}

const statusColor = (s) =>
  /out|injured reserve|suspend/i.test(s) ? 'bg-live/12 text-live' : /doubt|question/i.test(s) ? 'bg-[#ff9f0a]/15 text-[#c26a00] dark:text-[#ffb340]' : 'bg-fill text-label-2';

function Injuries({ preview, home, away }) {
  const lg = useLeague();
  const [open, setOpen] = useState({});
  const teams = [away, home]
    .map((t) => ({ t, list: preview.injuries.find((x) => x.teamId === t.id)?.list ?? [] }))
    .filter((x) => x.list.length);
  if (!teams.length) return null;
  return (
    <>
      <SectionTitle>Injury Report</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {teams.map(({ t, list }) => {
          const all = open[t.id];
          const shown = all ? list : list.slice(0, 4);
          return (
            <Card key={t.id} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 pb-1 pt-3 text-[14px] font-bold">
                <TeamLogo abbr={t.abbr} size={20} /> {t.name}
              </div>
              <div className="divide-y divide-sep">
                {shown.map((p) => (
                  <Link key={p.id ?? p.name} to={p.id ? `/${lg}/player/${p.id}` : '#'} className="flex items-center gap-3 px-4 py-2 transition hover:bg-fill/40">
                    <Headshot src={p.headshot} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">
                        {p.name} {p.pos && <span className="text-[12px] font-normal text-label-2">{p.pos}</span>}
                      </div>
                      <div className="truncate text-[12px] text-label-2">
                        {[p.detail, p.returnDate && `Est. return ${shortDate(p.returnDate)}`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColor(p.status)}`}>{p.status}</span>
                  </Link>
                ))}
              </div>
              {list.length > 4 && (
                <button
                  onClick={() => setOpen((o) => ({ ...o, [t.id]: !all }))}
                  className="w-full border-t border-sep py-2 text-[13px] font-semibold text-accent hover:bg-fill/40"
                >
                  {all ? 'Show less' : `Show all ${list.length}`}
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** Everything useful before tip-off / kickoff. */
export default function Preview({ g }) {
  const p = g.preview;
  if (!p) return null;
  return (
    <div className="rise">
      <Matchup preview={p} home={g.home} away={g.away} />
      <LastFive preview={p} home={g.home} away={g.away} />
      <Series preview={p} />
      <Injuries preview={p} home={g.home} away={g.away} />
    </div>
  );
}

