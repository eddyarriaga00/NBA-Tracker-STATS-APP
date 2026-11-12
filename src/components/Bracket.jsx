import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { currentSeason, firstSeason, getPlayoffGames, seasonLabel, teamHref } from '../api/espn';
import { useData } from '../lib/useData';
import { buildActualBracket, buildBracket } from '../lib/bracket';
import { useLeague } from '../lib/league';
import { Card, TeamLogo } from './ui';

// Bracket geometry (px). Two-sided: left conference → Finals ← right conference.
const CW = 124; // card width (fits seed, logo, 3-4 letter code, record)
const ROW = 29; // one team row
const CH = ROW * 2; // card height
const GY = 14; // vertical gap between first-round cards
const GX = 18; // gap between columns
const HEAD = 34; // column header height
const COLS = 7;
const WIDTH = COLS * CW + (COLS - 1) * GX;
const TREE_H = 4 * CH + 3 * GY;
const HEIGHT = HEAD + TREE_H + 70;
const colX = (i) => i * (CW + GX);

/** Vertical centers for each round of one side: 4 → 2 → 1. */
function centers() {
  const r0 = [0, 1, 2, 3].map((i) => HEAD + i * (CH + GY) + CH / 2);
  const r1 = [(r0[0] + r0[1]) / 2, (r0[2] + r0[3]) / 2];
  const r2 = [(r1[0] + r1[1]) / 2];
  return [r0, r1, r2];
}

const winnerSide = (g, advance) =>
  g.win !== undefined ? g.win : advance && g.a?.team && g.b?.team ? (g.a.team.seed <= g.b.team.seed ? 'a' : 'b') : null;

// The season being shown, so tapping a team opens that year's team page.
const BracketSeason = createContext(null);

function Slot({ s, lg, win, lose, bye }) {
  const season = useContext(BracketSeason);
  const base = 'flex items-center gap-1.5 px-2';
  if (bye) return <div className={`${base} text-[11.5px] font-semibold uppercase tracking-wide text-label-3`} style={{ height: ROW }}>Bye</div>;
  if (!s?.team) {
    return (
      <div className={`${base} text-[11.5px] italic text-label-3`} style={{ height: ROW }}>
        <span className="truncate">{s?.label ?? 'TBD'}</span>
      </div>
    );
  }
  const t = s.team;
  return (
    <Link to={teamHref(lg, t.id, season)} className={`${base} transition hover:bg-fill/50 ${lose ? 'opacity-40' : ''}`} style={{ height: ROW }}>
      <span className="num w-3.5 shrink-0 text-right text-[10px] font-semibold text-label-2">{t.seed < 99 ? t.seed : ''}</span>
      {/* eager: lazy images inside a sideways scroller often never load */}
      <TeamLogo abbr={t.abbr} size={17} eager />
      <span className={`min-w-0 flex-1 truncate text-[13px] ${win ? 'font-bold' : 'font-semibold'}`}>{t.abbr}</span>
      {s.value != null ? (
        <span className={`num shrink-0 text-[13px] ${win ? 'font-bold' : 'font-semibold text-label-2'}`}>{s.value}</span>
      ) : (
        <span className="num shrink-0 text-[10px] text-label-2">{t.wins}-{t.losses}</span>
      )}
    </Link>
  );
}

function GameBox({ g, lg, advance, x, cy }) {
  const w = winnerSide(g, advance);
  return (
    <div
      className="absolute overflow-hidden rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      style={{ left: x, top: cy - CH / 2, width: CW, height: CH }}
    >
      <Slot s={g.a} lg={lg} win={w === 'a'} lose={w === 'b'} />
      <div className="h-px bg-sep" />
      <Slot s={g.b} lg={lg} win={w === 'b'} lose={w === 'a'} bye={g.bye} />
    </div>
  );
}

/** One side of the tree. `dir` 1 = left side (flows right), -1 = right side (flows left). */
function side(conf, first, lg, advance, dir) {
  const rounds = [first, conf.rounds[conf.rounds.length - 2].games, conf.rounds[conf.rounds.length - 1].games];
  const cs = centers();
  const col = (k) => (dir === 1 ? k : COLS - 1 - k);
  const cards = [];
  const lines = [];
  rounds.forEach((games, k) => {
    games.forEach((g, j) => {
      cards.push(<GameBox key={`${dir}-${k}-${j}`} g={g} lg={lg} advance={advance} x={colX(col(k))} cy={cs[k][j]} />);
      if (k > 0) {
        // Elbow connectors from the two feeder games into this one.
        for (const f of [2 * j, 2 * j + 1]) {
          const fy = cs[k - 1][f];
          const fromX = dir === 1 ? colX(col(k - 1)) + CW : colX(col(k - 1));
          const toX = dir === 1 ? colX(col(k)) : colX(col(k)) + CW;
          const mid = (fromX + toX) / 2;
          lines.push(`M${fromX} ${fy}H${mid}V${cs[k][j]}H${toX}`);
        }
      }
    });
  });
  return { cards, lines };
}

/** Two-sided playoff bracket ("if the playoffs started today"). */
function hasGaps(lg, ...confs) {
  const open = (g) => !g?.bye && !(g?.a?.team && g?.b?.team && g.win);
  return confs.some((c) =>
    lg === 'nfl'
      ? [...c.treeFirst, ...c.rounds.slice(1).flatMap((r) => r.games)].some(open)
      : c.rounds.filter((r) => c.hasPlayIn || !/play-in/i.test(r.name)).some((r) => r.games.some(open))
  );
}

export default function Bracket({ confs, season }) {
  const lg = useLeague();
  const [advance, setAdvance] = useState(false);
  const scroller = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  const yr = season || currentSeason(lg);
  const games = useData((fresh) => getPlayoffGames(lg, yr, { fresh }), [lg, yr], {
    pollMs: (g) => (g?.some((x) => x.state === 'in') ? 30_000 : 0),
  });
  const actual = games.data ? buildActualBracket(lg, confs, games.data) : null;
  const real = !!actual?.started;
  const pastSeason = !!season && season !== currentSeason(lg);
  const b = real ? actual : buildBracket(lg, confs, { advance });

  // Official layout: West/AFC on the left, East/NFC on the right.
  const pick = (re) => b.conferences.find((c) => re.test(c.name ?? ''));
  const left = (lg === 'nfl' ? pick(/american/i) : pick(/west/i)) ?? b.conferences[0];
  const right = (lg === 'nfl' ? pick(/national/i) : pick(/east/i)) ?? b.conferences[1];

  const finalist = !!(b.final?.a?.team || b.final?.b?.team);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    setOverflowing(over);
    // Once a finalist is known, open on the final in the middle. Before that the
    // middle of the bracket is empty, so a phone opens on the first round instead.
    if (over) el.scrollLeft = finalist ? (el.scrollWidth - el.clientWidth) / 2 : 0;
  }, [lg, finalist]);

  if (pastSeason && yr < firstSeason(lg, 'bracket'))
    return (
      <Card className="rise px-4 py-6 text-center">
        <div className="text-[15px] font-semibold">No playoff results for {seasonLabel(lg, yr)}</div>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-label-2">
          ESPN’s playoff records start with {seasonLabel(lg, firstSeason(lg, 'bracket'))}. Standings for this season are still here.
        </p>
      </Card>
    );
  if (!left || !right) return null;
  const firstOf = (c) => (lg === 'nfl' ? c.treeFirst : c.rounds[1].games);
  const L = side(left, firstOf(left), lg, advance, 1);
  const R = side(right, firstOf(right), lg, advance, -1);

  // Final in the middle column, joined to both conference finals.
  const midY = HEAD + TREE_H / 2;
  const fx = colX(3);
  const finalLines = [`M${colX(2) + CW} ${midY}H${fx}`, `M${colX(4)} ${midY}H${fx + CW}`];
  const fw = b.final.winner?.team;
  const fa = b.final.a;
  const fb = b.final.b;

  const roundNames = lg === 'nfl' ? ['Wild Card', 'Divisional', 'Conf. Champ.'] : ['First Round', 'Semifinals', 'Conf. Finals'];
  const headers = [...roundNames.map((n) => [left.short, n]), ['', b.final.name], ...[...roundNames].reverse().map((n) => [right.short, n])];
  const nowSeason = !season || season === currentSeason(lg);

  return (
    <BracketSeason.Provider value={yr}>
    <div className="rise">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-[12.5px] text-label-2">
          {real
            ? fw
              ? `${seasonLabel(lg, yr)} playoffs · actual results`
              : `${seasonLabel(lg, yr)} playoffs · in progress`
            : games.loading && !nowSeason
              ? 'Loading playoff results…'
              : nowSeason
                ? 'If the playoffs started today, based on current seeds.'
                : `Seeds from the final ${seasonLabel(lg, season)} standings. Not the actual results.`}
        </p>
        {!real && <button
          role="switch"
          aria-checked={advance}
          onClick={() => setAdvance((v) => !v)}
          className={`rounded-full px-3 py-1 text-[12.5px] font-semibold transition active:scale-95 ${advance ? 'bg-accent text-white' : 'bg-fill text-label-2'}`}
        >
          {advance ? '✓ ' : ''}Higher seeds win
        </button>}
      </div>

      {lg === 'nba' && (!real || left.hasPlayIn || right.hasPlayIn) && (
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {[left, right].map((c) => (
            <div key={c.name}>
              <h3 className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-label-2">{c.short} Play-In</h3>
              <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:px-0">
                {c.rounds[0].games.map((g, i) => {
                  const w = winnerSide(g, advance);
                  return (
                    <div key={i} className="shrink-0" style={{ width: CW + 8 }}>
                      <Card className="overflow-hidden">
                        <Slot s={g.a} lg={lg} win={w === 'a'} lose={w === 'b'} />
                        <div className="h-px bg-sep" />
                        <Slot s={g.b} lg={lg} win={w === 'b'} lose={w === 'a'} />
                      </Card>
                      <div className="mt-1 px-1 text-[10.5px] leading-tight text-label-3">{g.note}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="relative -mx-3 md:mx-0">
        <div ref={scroller} className="no-scrollbar overflow-x-auto overscroll-x-contain px-3 pb-2 md:px-0">
          <div className="relative mx-auto" style={{ width: WIDTH, height: HEIGHT }}>
            {headers.map(([conf, name], i) => (
              <div key={i} className="absolute text-center leading-tight" style={{ left: colX(i), width: CW, top: 0 }}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-label-3">{conf || '🏆'}</div>
                <div className={`truncate text-[11px] font-semibold uppercase tracking-wide ${i === 3 ? 'text-[#806000] dark:text-[#ffd60a]' : 'text-label-2'}`}>{name}</div>
              </div>
            ))}
            <svg className="pointer-events-none absolute inset-0" width={WIDTH} height={HEIGHT} aria-hidden>
              {[...L.lines, ...R.lines, ...finalLines].map((d, i) => (
                <path key={i} d={d} fill="none" stroke="var(--label-3)" strokeOpacity="0.55" strokeWidth="1.5" />
              ))}
            </svg>
            {L.cards}
            {R.cards}
            <div className="absolute overflow-hidden rounded-xl bg-card ring-2 ring-[#ffcc00]" style={{ left: fx, top: midY - CH / 2, width: CW, height: CH }}>
              <Slot s={fa} lg={lg} win={fw && fa.team === fw} lose={fw && fa.team !== fw} />
              <div className="h-px bg-sep" />
              <Slot s={fb} lg={lg} win={fw && fb.team === fw} lose={fw && fb.team !== fw} />
            </div>
            {fw && (
              <div className="absolute text-center" style={{ left: fx - 10, width: CW + 20, top: midY + CH / 2 + 8 }}>
                <div className="text-[18px]" aria-hidden>🏆</div>
                <div className="flex items-center justify-center gap-1 text-[12px] font-bold">
                  <TeamLogo abbr={fw.abbr} size={16} eager /> {fw.abbr}
                </div>
              </div>
            )}
          </div>
        </div>
        {overflowing && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-bg to-transparent md:hidden" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-bg to-transparent md:hidden" />
          </>
        )}
      </div>
      {overflowing && <p className="mt-1 text-center text-[11.5px] text-label-3">Swipe sideways to see the whole bracket</p>}

      <div className="mt-3 space-y-1 px-1 text-[11.5px] text-label-3">
        {lg === 'nfl' && (
          <p>
            {left.byes === 2 ? 'The top 2 seeds got byes (before 2020, 6 teams per conference made it).' : 'The 1 seed gets a bye.'} In the Divisional round the 1 seed hosts the lowest seed left.
          </p>
        )}
        {real && (
          <p>
            {lg === 'nfl' ? 'Final scores shown.' : left.hasPlayIn || right.hasPlayIn ? 'Series wins shown; Play-In shows final scores.' : 'Series wins shown. (The Play-In started in 2020-21.)'} Tap a team for its page.
          </p>
        )}
        {!real && advance && fw && (
          <p>The final goes to the better record{fa.team && fb.team && fa.team.pct === fb.team.pct ? ' (tied records go to the top team)' : ''}.</p>
        )}
        {(!left.complete || !right.complete) && <p>Seeds aren’t set for every spot yet, so some slots are empty.</p>}
        {real && pastSeason && hasGaps(lg, left, right) && <p>ESPN’s records are missing some games from this postseason, so some spots are empty or have no winner.</p>}
      </div>
    </div>
    </BracketSeason.Provider>
  );
}
