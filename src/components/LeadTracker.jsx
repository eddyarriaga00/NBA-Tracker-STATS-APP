import { useMemo } from 'react';
import { visibleColor } from '../lib/color';
import { useTheme } from '../lib/theme';
import { Card, SectionTitle, TeamLogo } from './ui';

const secs = (c = '') => (c.includes(':') ? c.split(':').reduce((m, x) => m * 60 + (Number(x) || 0), 0) : Number(c) || 0);
const ord = (p, nfl) => (p <= 4 ? ['1st', '2nd', '3rd', '4th'][p - 1] : p === 5 ? 'OT' : `${p - 4}OT`) + (nfl || p > 4 ? '' : '');

/** Who led, by how much, all game long. Built from the play-by-play (NFL: scoring plays). */
export function buildFlow(g) {
  const nfl = g.league === 'nfl';
  const reg = nfl ? 900 : 720;
  const ot = nfl ? 600 : 300;
  const startOf = (p) => (p <= 4 ? (p - 1) * reg : 4 * reg + (p - 5) * ot);
  const lenOf = (p) => (p <= 4 ? reg : ot);
  const src = (g.plays?.length ? g.plays : g.scoringPlays ?? []).filter((p) => p.period > 0 && p.home != null && p.away != null);
  if (src.length < 2) return null;

  const pts = [{ t: 0, m: 0 }]; // m > 0: away leads (away is drawn on top, as it's listed first everywhere)
  let lastPeriod = 1;
  const best = { away: null, home: null };
  let changes = 0;
  let ties = 0;
  let leader = 0;
  let prev = 0;
  for (const p of src) {
    const t = startOf(p.period) + Math.max(0, lenOf(p.period) - secs(p.clock));
    const m = Number(p.away) - Number(p.home);
    if (!Number.isFinite(m)) continue;
    lastPeriod = Math.max(lastPeriod, p.period);
    if (m === prev && pts.length > 1) { pts[pts.length - 1].t2 = t; continue; }
    if (nfl) pts.push({ t, m: prev }); // football scores jump; hold the line until the score
    pts.push({ t, m });
    const side = m > 0 ? 'away' : m < 0 ? 'home' : null;
    if (side && (!best[side] || Math.abs(m) > best[side].by)) best[side] = { by: Math.abs(m), when: `${p.clock} ${ord(p.period)}` };
    if (m === 0 && prev !== 0) ties++;
    const s = Math.sign(m);
    if (s !== 0 && leader !== 0 && s !== leader) changes++;
    if (s !== 0) leader = s;
    prev = m;
  }
  const periods = Math.max(4, g.status?.period || lastPeriod, lastPeriod);
  const total = startOf(periods + 1);
  // Carry the line to "now" (or the end, once it's final).
  const nowT = g.status?.state === 'post' ? Math.max(pts[pts.length - 1].t, startOf(lastPeriod + 1))
    : Math.max(pts[pts.length - 1].t, pts[pts.length - 1].t2 ?? 0);
  pts.push({ t: Math.min(nowT, total), m: prev });
  return { pts, total, periods, startOf, best, changes, ties, margin: prev };
}

export default function LeadTracker({ g }) {
  const { dark } = useTheme();
  const flow = useMemo(() => buildFlow(g), [g]);
  if (!flow) return null;
  const nfl = g.league === 'nfl';
  const a = visibleColor(g.away.color, dark, g.away.alt);
  const h = visibleColor(g.home.color, dark, g.home.alt);
  const W = 320;
  const H = 108;
  const mid = H / 2;
  const peak = Math.max(8, ...flow.pts.map((p) => Math.abs(p.m)));
  const x = (t) => (t / flow.total) * W;
  const y = (m) => mid - (m / peak) * (mid - 8);
  const line = flow.pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.m).toFixed(1)}`).join(' ');
  const end = flow.pts[flow.pts.length - 1];
  const area = `${line} L${x(end.t).toFixed(1)} ${mid} L0 ${mid} Z`;
  const live = g.status.state === 'in';
  const id = `lt-${g.id}`;
  const lead = flow.margin === 0 ? 'Tied' : `${flow.margin > 0 ? g.away.abbr : g.home.abbr} by ${Math.abs(flow.margin)}`;

  const Tile = ({ t, v, sub, when }) => (
    <div className="min-w-0 flex-1 px-1 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {t && <TeamLogo abbr={t.abbr} size={18} />}
        <span className="num font-display text-[20px] font-bold leading-none">{v}</span>
      </div>
      <div className="mt-1 text-[11px] leading-tight text-label-2">{sub}</div>
      {when && <div className="num text-[10.5px] leading-tight text-label-3">{when}</div>}
    </div>
  );

  return (
    <>
      <SectionTitle right={<span className="text-[12.5px] font-semibold text-label-2">{live ? lead : flow.margin === 0 ? '' : `${flow.margin > 0 ? g.away.abbr : g.home.abbr} won by ${Math.abs(flow.margin)}`}</span>}>
        Lead Tracker
      </SectionTitle>
      <Card className="overflow-hidden">
        <div className="relative px-3 pt-3">
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 text-[10.5px] font-semibold text-label-2"><TeamLogo abbr={g.away.abbr} size={16} /> {g.away.abbr} ahead</div>
          <div className="pointer-events-none absolute bottom-6 left-3 flex items-center gap-1 text-[10.5px] font-semibold text-label-2"><TeamLogo abbr={g.home.abbr} size={16} /> {g.home.abbr} ahead</div>
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="none" style={{ height: 132 }} role="img" aria-label={`Lead by time. ${lead}.`}>
            <defs>
              <clipPath id={`${id}-top`}><rect x="0" y="0" width={W} height={mid} /></clipPath>
              <clipPath id={`${id}-bot`}><rect x="0" y={mid} width={W} height={mid} /></clipPath>
            </defs>
            {Array.from({ length: flow.periods - 1 }, (_, i) => (
              <line key={i} x1={x(flow.startOf(i + 2))} x2={x(flow.startOf(i + 2))} y1="4" y2={H - 4} stroke="currentColor" className="text-sep" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill={a} opacity="0.28" clipPath={`url(#${id}-top)`} />
            <path d={area} fill={h} opacity="0.28" clipPath={`url(#${id}-bot)`} />
            <path d={line} fill="none" stroke={a} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${id}-top)`} vectorEffect="non-scaling-stroke" />
            <path d={line} fill="none" stroke={h} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${id}-bot)`} vectorEffect="non-scaling-stroke" />
            <line x1="0" x2={W} y1={mid} y2={mid} stroke="currentColor" className="text-label-3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          {live && (
            <span className="live-dot absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-live" style={{ left: `calc(12px + (100% - 24px) * ${end.t / flow.total})`, top: 12 + (y(end.m) / H) * 132 }} />
          )}
          <div className="num grid pb-2 pt-1 text-center text-[10.5px] font-semibold text-label-3" style={{ gridTemplateColumns: Array.from({ length: flow.periods }, (_, i) => `${flow.startOf(i + 2) - flow.startOf(i + 1)}fr`).join(' ') }}>
            {Array.from({ length: flow.periods }, (_, i) => <span key={i}>{i < 4 ? `${nfl ? 'Q' : 'Q'}${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`}</span>)}
          </div>
        </div>
        <div className="flex divide-x divide-sep border-t border-sep py-3">
          <Tile t={g.away} v={flow.best.away?.by ?? 0} sub={flow.best.away ? 'Biggest lead' : 'Never led'} when={flow.best.away?.when} />
          <Tile t={g.home} v={flow.best.home?.by ?? 0} sub={flow.best.home ? 'Biggest lead' : 'Never led'} when={flow.best.home?.when} />
          <Tile v={flow.changes} sub={`Lead change${flow.changes === 1 ? '' : 's'}`} when={`${flow.ties} tie${flow.ties === 1 ? '' : 's'}`} />
        </div>
      </Card>
    </>
  );
}
