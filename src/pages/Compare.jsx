import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { currentSeason, getLeaders, getPlayer, LEADER_CATS, searchPlayers } from '../api/espn';
import { Icon } from '../components/icons';
import { BackButton, Card, Headshot, PageTitle, SectionTitle, Segmented, Skeleton, TeamLogo } from '../components/ui';
import { useLeague } from '../lib/league';
import { useData } from '../lib/useData';

// Stats where a smaller number is better.
const LOWER_IS_BETTER = new Set(['TO', 'PF', 'INT', 'FUM', 'LOST', 'SACK', 'SACKS']);
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const RECENT_KEY = 'recentCompares';
const loadRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
/** Remember a finished comparison (newest first, four per league at most). */
function saveRecent(lg, pa, pb) {
  const side = (p, id) => ({ id, name: p.bio.name ?? [p.bio.first, p.bio.last].filter(Boolean).join(' '), headshot: p.bio.headshot });
  const item = { lg, a: side(pa, pa.bio.id), b: side(pb, pb.bio.id) };
  if (!item.a.id || !item.b.id) return;
  const same = (x) => x.lg === lg && [x.a.id, x.b.id].sort().join() === [item.a.id, item.b.id].sort().join();
  const rest = loadRecent().filter((x) => !same(x));
  const mine = [item, ...rest.filter((x) => x.lg === lg)].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([...mine, ...rest.filter((x) => x.lg !== lg)])); } catch { /* storage full or blocked */ }
}

const SUGGEST = { nba: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame'], nfl: ['passingYards', 'rushingYards', 'receivingYards'] };

function Pair({ a, b, sub, onPick }) {
  return (
    <button onClick={() => onPick(a.id, b.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-fill/40 active:bg-fill md:px-4">
      <span className="flex shrink-0">
        <Headshot src={a.headshot} size={36} />
        <Headshot src={b.headshot} size={36} className="-ml-2.5 ring-2 ring-card" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug">{a.name} <span className="font-normal text-label-3">vs</span> {b.name}</span>
        {sub && <span className="block truncate text-[12px] text-label-2">{sub}</span>}
      </span>
      <svg aria-hidden width="8" height="13" viewBox="0 0 8 13" className="shrink-0 text-label-3">
        <path d="M1.5 1.5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Something to tap when no one is picked yet: your recent comparisons and the league's leaders. */
function Starters({ lg, onPick }) {
  const { data } = useData(() => getLeaders(lg, currentSeason(lg)), ['compare-starters', lg], { remember: `leaders:${lg}:${currentSeason(lg)}` });
  const recent = useMemo(() => loadRecent().filter((x) => x.lg === lg), [lg]);
  const pairs = useMemo(() => {
    const used = new Set();
    const out = [];
    for (const key of SUGGEST[lg]) {
      const two = (data?.categories?.[key] ?? []).filter((p) => p.id && !used.has(p.id)).slice(0, 2);
      if (two.length < 2) continue;
      two.forEach((p) => used.add(p.id));
      const cat = LEADER_CATS[lg].find((c) => c.key === key);
      out.push({ a: two[0], b: two[1], sub: `Top two in ${cat?.label.toLowerCase() ?? 'the league'}` });
    }
    return out;
  }, [data, lg]);
  return (
    <>
      {recent.length > 0 && (
        <>
          <SectionTitle>Recent</SectionTitle>
          <Card className="divide-y divide-sep overflow-hidden">
            {recent.map((r) => <Pair key={`${r.a.id}:${r.b.id}`} a={r.a} b={r.b} onPick={onPick} />)}
          </Card>
        </>
      )}
      <SectionTitle>Try a matchup</SectionTitle>
      {pairs.length ? (
        <Card className="divide-y divide-sep overflow-hidden">
          {pairs.map((x) => <Pair key={`${x.a.id}:${x.b.id}`} {...x} onPick={onPick} />)}
        </Card>
      ) : (
        <Skeleton className="h-[168px] !rounded-2xl" />
      )}
    </>
  );
}

function PlayerPicker({ lg, onPick, exclude }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const ref = useRef(null);
  // No auto-focus: on a phone it would open the keyboard as soon as Compare opens.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchPlayers(term).then((r) => alive && setHits(r.filter((p) => p.league === lg && p.id !== exclude).slice(0, 8))).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q, lg, exclude]);
  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl bg-fill px-3 py-2">
        <Icon.Search className="h-4 w-4 text-label-2" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label={`Search ${lg.toUpperCase()} players`}
          className="w-full bg-transparent text-[16px] outline-none placeholder:text-label-3"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {hits.length > 0 && (
        <div className="mt-2 divide-y divide-sep overflow-hidden rounded-xl bg-card-2">
          {hits.map((p) => (
            <button key={p.id} onClick={() => onPick(p.id)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-fill/50">
              <Headshot src={p.headshot} size={30} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.name}</span>
              <span className="truncate text-[11.5px] text-label-2">{p.team}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ p, lg, onChange, side }) {
  const b = p.bio;
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center text-center ${side === 'b' ? '' : ''}`}>
      <Link to={`/${lg}/player/${b.id}`}>
        <Headshot src={b.headshot} size={76} />
      </Link>
      <div className="mt-2 w-full truncate font-display text-[16px] font-bold leading-tight md:text-[18px]">{b.name}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[12px] text-label-2">
        {b.team && <TeamLogo abbr={b.team.abbr} size={14} league={lg} />}
        <span className="truncate">{[b.team?.abbr, b.posAbbr].filter(Boolean).join(' · ')}</span>
      </div>
      <button onClick={onChange} className="mt-1.5 text-[12px] font-semibold text-accent">Change</button>
    </div>
  );
}

function Row({ label, a, b, lower }) {
  const na = num(a);
  const nb = num(b);
  const both = na != null && nb != null && na !== nb;
  const aWins = both && (lower ? na < nb : na > nb);
  const bWins = both && (lower ? nb < na : nb > na);
  const total = Math.abs(na ?? 0) + Math.abs(nb ?? 0) || 1;
  return (
    <div className="border-t border-sep px-4 py-2.5">
      <div className="flex items-center justify-between text-[14px]">
        <span className={`num w-20 ${aWins ? 'font-bold text-label' : 'text-label-2'}`}>{a ?? '–'}</span>
        <span className="text-center text-[12px] font-semibold uppercase tracking-wide text-label-2">{label}</span>
        <span className={`num w-20 text-right ${bWins ? 'font-bold text-label' : 'text-label-2'}`}>{b ?? '–'}</span>
      </div>
      {na != null && nb != null && (
        <div className="mt-1.5 flex h-[5px] gap-1">
          <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-fill">
            <div className={`h-full rounded-full ${aWins ? 'bg-accent' : 'bg-label-3'}`} style={{ width: `${(Math.abs(na) / total) * 100}%` }} />
          </div>
          <div className="flex-1 overflow-hidden rounded-full bg-fill">
            <div className={`h-full rounded-full ${bWins ? 'bg-[#bf5af2]' : 'bg-label-3'}`} style={{ width: `${(Math.abs(nb) / total) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function statRows(pa, pb, splitLabel) {
  // Match stats by their full name ("Passing Yards" vs "Rushing Yards"), not the
  // short label ("YDS"), so a QB's passing yards never line up with a RB's rushing yards.
  const sa = pa.splits;
  const sb = pb.splits;
  if (!sa || !sb) return [];
  const ra = sa.rows.find((r) => r.label === splitLabel);
  const rb = sb.rows.find((r) => r.label === splitLabel);
  if (!ra || !rb) return [];
  const key = (s, i) => s.names?.[i] || s.labels[i];
  const dupes = new Set(sa.labels.filter((l, i) => sa.labels.indexOf(l) !== i));
  const rows = [];
  const usedB = new Set();
  sa.labels.forEach((label, i) => {
    const k = key(sa, i);
    const j = sb.labels.findIndex((_, m) => key(sb, m) === k && !usedB.has(m));
    if (j < 0) return;
    usedB.add(j);
    rows.push({ label: dupes.has(label) ? k : label, a: ra.stats[i], b: rb.stats[j], lower: LOWER_IS_BETTER.has(label) });
  });
  return rows;
}

export default function Compare() {
  const lg = useLeague();
  const [params, setParams] = useSearchParams();
  const a = params.get('a');
  const b = params.get('b');
  const [picking, setPicking] = useState(null); // 'a' | 'b' | null
  const [view, setView] = useState('Regular Season');

  const set = (side, id) => {
    const next = new URLSearchParams(params);
    next.set(side, id);
    setParams(next, { replace: true });
    setPicking(null);
  };

  const A = useData((fresh) => (a ? getPlayer(lg, a, { fresh }) : Promise.resolve(null)), [lg, a]);
  const B = useData((fresh) => (b ? getPlayer(lg, b, { fresh }) : Promise.resolve(null)), [lg, b]);
  const pa = A.data;
  const pb = B.data;

  const splitOptions = useMemo(() => {
    if (!pa?.splits || !pb?.splits) return [];
    const bl = new Set(pb.splits.rows.map((r) => r.label));
    return pa.splits.rows.map((r) => r.label).filter((l) => bl.has(l));
  }, [pa, pb]);
  const split = splitOptions.includes(view) ? view : splitOptions[0];
  const rows = pa && pb && split ? statRows(pa, pb, split) : [];

  const factRows = useMemo(() => {
    if (!pa || !pb) return [];
    const fa = Object.fromEntries(pa.bio.facts);
    const fb = Object.fromEntries(pb.bio.facts);
    return ['Age', 'Height', 'Weight', 'Experience', 'Draft', 'College'].filter((k) => fa[k] || fb[k]).map((k) => ({ label: k, a: fa[k] ?? '–', b: fb[k] ?? '–' }));
  }, [pa, pb]);

  // A comparison with both players loaded goes on the Recent list.
  useEffect(() => { if (pa && pb) saveRecent(lg, pa, pb); }, [lg, pa, pb]);
  const pickBoth = (x, y) => setParams({ a: x, b: y }, { replace: true });

  const slot = (side, p, state) => {
    if (picking === side || (!p && !state.loading)) {
      return (
        <Card className="min-w-0 flex-1 p-3">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-label-2">{side === 'a' ? 'Player 1' : 'Player 2'}</div>
          <PlayerPicker lg={lg} onPick={(id) => set(side, id)} exclude={side === 'a' ? b : a} />
          {picking === side && p && <button onClick={() => setPicking(null)} className="mt-2 text-[13px] text-label-2">Cancel</button>}
        </Card>
      );
    }
    if (state.loading && !p) return <Skeleton className="h-[150px] min-w-0 flex-1 !rounded-2xl" />;
    return <Header p={p} lg={lg} side={side} onChange={() => setPicking(side)} />;
  };

  return (
    <div>
      <BackButton />
      <PageTitle eyebrow={lg.toUpperCase()}>Compare</PageTitle>

      <Card className="relative px-3 py-4">
        <div className="flex items-start gap-3">
          {slot('a', pa, A)}
          <div className="grid h-[76px] shrink-0 place-items-center text-[13px] font-bold text-label-3">VS</div>
          {slot('b', pb, B)}
        </div>
        {pa && pb && !picking && (
          <div className="mt-3 flex justify-center gap-6 text-[11.5px] text-label-2">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />{pa.bio.last}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#bf5af2]" />{pb.bio.last}</span>
          </div>
        )}
      </Card>

      {!a && !b && <Starters lg={lg} onPick={pickBoth} />}

      {pa && pb && (
        <>
          {splitOptions.length > 1 && (
            <Segmented className="mt-4" value={split} onChange={setView} options={splitOptions.slice(0, 4).map((l) => ({ value: l, label: l.replace('Regular Season', 'This Season').replace('Last 5 Games', 'Last 5') }))} />
          )}
          <Card className="mt-3 overflow-hidden">
            <div className="px-4 pb-1 pt-3 text-[15px] font-bold">{split === 'Regular Season' ? 'This Season' : split}</div>
            {rows.length ? (
              rows.map((r) => <Row key={r.label} {...r} />)
            ) : (
              <p className="px-4 pb-4 pt-1 text-[13px] text-label-2">These two don’t share stats to compare{lg === 'nfl' ? ' (different positions)' : ''}.</p>
            )}
          </Card>
          {factRows.length > 0 && (
            <Card className="mt-3 overflow-hidden">
              <div className="px-4 pb-1 pt-3 text-[15px] font-bold">Bio</div>
              {factRows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 border-t border-sep px-4 py-2.5 text-[13.5px]">
                  <span className="w-[38%] min-w-0 truncate">{r.a}</span>
                  <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-label-2">{r.label}</span>
                  <span className="w-[38%] min-w-0 truncate text-right">{r.b}</span>
                </div>
              ))}
            </Card>
          )}
          {(pa.awards?.length > 0 || pb.awards?.length > 0) && (
            <Card className="mt-3 overflow-hidden">
              <div className="px-4 pb-1 pt-3 text-[15px] font-bold">Major awards</div>
              {['MVP', 'Finals MVP', 'Super Bowl MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'All-NBA 1st Team', 'All-Star']
                .map((name) => {
                  const ca = pa.awards.find((x) => x.name === name)?.seasons.length ?? 0;
                  const cb = pb.awards.find((x) => x.name === name)?.seasons.length ?? 0;
                  return ca || cb ? <Row key={name} label={name} a={String(ca)} b={String(cb)} /> : null;
                })}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
