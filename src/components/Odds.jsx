import { peekGame } from '../lib/morph';
import { fmtLine, fmtOdds, impliedOdds, lineResult, mergeOdds } from '../lib/odds';
import { visibleColor } from '../lib/color';
import { useTheme } from '../lib/theme';
import { Card, SectionTitle, TeamLogo } from './ui';

function Moved({ from, to, fmt = fmtLine }) {
  if (from == null || to == null || from === to) return null;
  return <span className="block text-[10.5px] font-normal text-label-3">opened {fmt(from)}</span>;
}

/** Spread, total and moneyline for a game; after it ends, how each one finished. */
export default function GameOdds({ g }) {
  const { dark } = useTheme();
  // The game feed has the line ESPN shows; the scoreboard adds where it opened.
  const o = mergeOdds(g.preview?.odds, g.odds ?? peekGame(g.league, g.id)?.odds);
  if (!o) return null;
  const { away, home } = g;
  const result = lineResult(o, g);
  const chance = g.status.state === 'pre' ? impliedOdds(o) : null;
  const awayLine = o.homeLine == null ? null : -o.homeLine;
  const rows = [
    {
      t: away,
      spread: awayLine,
      spreadOdds: o.awaySpreadOdds,
      ml: o.awayML,
      openSpread: o.open?.homeLine == null ? null : -o.open.homeLine,
      openMl: o.open?.awayML,
      total: o.total == null ? null : `o${o.total}`,
      totalOdds: o.overOdds,
      openTotal: o.open?.total,
    },
    {
      t: home,
      spread: o.homeLine,
      spreadOdds: o.homeSpreadOdds,
      ml: o.homeML,
      openSpread: o.open?.homeLine,
      openMl: o.open?.homeML,
      total: o.total == null ? null : `u${o.total}`,
      totalOdds: o.underOdds,
      openTotal: o.open?.total,
    },
  ];
  const a = visibleColor(away.color, dark);
  const h = visibleColor(home.color, dark);
  const cell = 'px-2 py-2 text-center';
  return (
    <>
      <SectionTitle right={o.provider ? <span className="text-[12px] text-label-2">{o.provider}</span> : null}>
        {g.status.state === 'pre' ? 'Odds' : 'Betting Line'}
      </SectionTitle>
      <Card className="overflow-hidden">
        <table className="num w-full text-[14px]">
          <thead>
            <tr className="text-[10.5px] font-semibold uppercase tracking-wide text-label-3">
              <th className="py-2 pl-4 text-left font-semibold">Team</th>
              <th className={`${cell} font-semibold`}>Spread</th>
              <th className={`${cell} font-semibold`}>Total</th>
              <th className={`${cell} pr-4 font-semibold`}>Money</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id} className="border-t border-sep align-top">
                <td className="py-2 pl-4">
                  <span className="flex items-center gap-2 font-semibold">
                    <TeamLogo abbr={r.t.abbr} size={20} />
                    {r.t.abbr}
                  </span>
                </td>
                <td className={cell}>
                  <span className="font-semibold">{fmtLine(r.spread)}</span>
                  {r.spreadOdds != null && <span className="ml-1 text-[11.5px] text-label-2">{fmtOdds(r.spreadOdds)}</span>}
                  <Moved from={r.openSpread} to={r.spread} />
                </td>
                <td className={cell}>
                  <span className="font-semibold">{r.total ?? '–'}</span>
                  {r.totalOdds != null && <span className="ml-1 text-[11.5px] text-label-2">{fmtOdds(r.totalOdds)}</span>}
                  {r === rows[0] && <Moved from={r.openTotal} to={o.total} fmt={(v) => String(v)} />}
                </td>
                <td className={`${cell} pr-4`}>
                  <span className="font-semibold">{fmtOdds(r.ml)}</span>
                  <Moved from={r.openMl} to={r.ml} fmt={fmtOdds} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {chance && (
          <div className="border-t border-sep px-4 py-2.5">
            <div className="flex justify-between text-[12px]">
              <span className="num font-semibold">{away.abbr} {chance.away.toFixed(0)}%</span>
              <span className="text-label-3">Win chance the odds imply</span>
              <span className="num font-semibold">{chance.home.toFixed(0)}% {home.abbr}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 gap-[2px] overflow-hidden rounded-full">
              <div className="rounded-l-full" style={{ width: `${chance.away}%`, background: a }} />
              <div className="flex-1 rounded-r-full" style={{ background: h }} />
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-sep px-4 py-2.5 text-[13px]">
            {result.spread && (
              <span>
                <span className="text-label-2">Spread · </span>
                {result.spread.push ? (
                  <span className="font-semibold">Push</span>
                ) : (
                  <span className="font-semibold">
                    {g[result.spread.winner].abbr} covered <span className="font-normal text-label-2">by {result.spread.by}</span>
                  </span>
                )}
              </span>
            )}
            {result.total && (
              <span>
                <span className="text-label-2">Total · </span>
                <span className="font-semibold">{result.total.push ? 'Push' : result.total.over ? 'Over' : 'Under'}</span>
                <span className="text-label-2"> ({result.total.sum} points)</span>
              </span>
            )}
          </div>
        )}
      </Card>
      <p className="mt-1.5 px-1 text-[11px] text-label-3">For information only. Lines change; check a sportsbook before betting. 21+, gamble responsibly.</p>
    </>
  );
}
