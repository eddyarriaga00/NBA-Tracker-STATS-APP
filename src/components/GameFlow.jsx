import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { visibleColor } from '../lib/color';
import { useTheme } from '../lib/theme';
import { buildFlow } from './LeadTracker';
import { Card, TeamLogo } from './ui';

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const pct = (v) => `${v >= 99.95 ? 100 : v <= 0.05 ? 0 : v.toFixed(v >= 10 && v <= 90 ? 0 : 1)}%`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * The story of the game in one chart: the lead over time, or each team's
 * chance of winning, on the same timeline. The away team is always on top.
 * Drag across it to read the score, lead and win chance at any moment.
 */
export default function GameFlow({ g }) {
  const { dark } = useTheme();
  const flow = useMemo(() => buildFlow(g), [g]);
  const wp = g.status.state !== 'pre' && g.winProb?.points?.length > 1 ? g.winProb : null;
  const [pick, setPick] = useState('lead');
  const [hoverT, setHoverT] = useState(null);
  const [w, setW] = useState(0);
  const box = useRef(null);
  const uid = useId().replace(/:/g, '');
  const any = !!(flow || wp);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(Math.max(240, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [any]);

  if (!any) return null;
  const mode = (pick === 'lead' ? flow : wp) ? pick : flow ? 'lead' : 'wp';
  const { away, home } = g;
  const live = g.status.state === 'in';
  const a = visibleColor(away.color, dark, away.alt);
  const h = visibleColor(home.color, dark, home.alt);

  const time = mode === 'lead'
    ? { total: flow.total, periods: flow.periods, startOf: flow.startOf }
    : { total: wp.total, periods: wp.periods, startOf: (p) => (p <= 4 ? (p - 1) * wp.regLen : 4 * wp.regLen + (p - 5) * wp.otLen) };

  const H = 132;
  const top = 6;
  const ih = H - top - 18;
  const mid = top + ih / 2;
  const x = (t) => (t / time.total) * w;
  // Both series run from -1 (all home) to +1 (all away).
  const peak = flow ? Math.max(8, ...flow.pts.map((p) => Math.abs(p.m))) : 1;
  const pts = mode === 'lead' ? flow.pts.map((p) => [p.t, p.m / peak]) : wp.points.map((p) => [p.t, (50 - p.home) / 50]);
  const y = (v) => mid - v * (ih / 2 - 3);
  const line = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const end = pts[pts.length - 1];
  const area = `${line}L${x(end[0]).toFixed(1)} ${mid}L${x(pts[0][0]).toFixed(1)} ${mid}Z`;

  const leadAt = (t) => {
    if (!flow) return null;
    let m = 0;
    for (const p of flow.pts) { if (p.t > t) break; m = p.m; }
    return m;
  };
  const wpAt = (t) => {
    if (!wp) return null;
    let best = wp.points[0];
    for (const p of wp.points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    return best;
  };
  const t = hoverT == null ? end[0] : Math.min(hoverT, end[0]);
  const hw = hoverT == null ? wp?.points.at(-1) : wpAt(t);
  const m = hoverT == null ? (flow ? flow.margin : null) : leadAt(t);
  const leadText = m == null ? '' : m === 0 ? 'Tied' : `${m > 0 ? away.abbr : home.abbr} by ${Math.abs(m)}`;
  let readout;
  if (hoverT != null) {
    let p = 1;
    while (p < time.periods && time.startOf(p + 1) <= t) p++;
    const clock = hw && wp && mode === 'wp' ? hw.clock : mmss(Math.max(0, time.startOf(p + 1) - t));
    readout = [`${periodName(p)} ${clock}`, hw?.away != null ? `${away.abbr} ${hw.away}–${hw.homeScore} ${home.abbr}` : leadText].filter(Boolean).join(' · ');
  } else if (m != null) {
    readout = live ? leadText : m === 0 ? 'Final' : `${m > 0 ? away.abbr : home.abbr} won by ${Math.abs(m)}`;
  } else {
    readout = live ? 'Now' : 'Final';
  }

  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    setHoverT(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * time.total);
  };
  const hv = hoverT == null ? null : mode === 'lead' ? (m ?? 0) / peak : hw ? (50 - hw.home) / 50 : 0;

  const Tab = ({ v, children }) => (
    <button
      onClick={() => { setPick(v); setHoverT(null); }}
      aria-pressed={mode === v}
      className={`rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold transition ${mode === v ? 'bg-label text-bg' : 'text-label-2'}`}
    >
      {children}
    </button>
  );
  const Tile = ({ team, v, sub, when }) => (
    <div className="min-w-0 flex-1 px-1 text-center">
      <div className="flex items-center justify-center gap-1">
        {team && <TeamLogo abbr={team.abbr} size={14} />}
        <span className="num text-[15px] font-bold leading-none">{v}</span>
      </div>
      <div className="mt-1 truncate text-[10.5px] leading-tight text-label-2">{sub}</div>
      {when && <div className="num truncate text-[10px] leading-tight text-label-3">{when}</div>}
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="text-[13px] font-semibold text-label-2">Game flow</div>
        {flow && wp && (
          <div className="flex rounded-full bg-fill p-[2px]">
            <Tab v="lead">Lead</Tab>
            <Tab v="wp">Win %</Tab>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 px-3.5 text-[13px]">
        <span className="flex shrink-0 items-center gap-1.5">
          <TeamLogo abbr={away.abbr} size={18} />
          <span className="font-semibold">{away.abbr}</span>
          {hw && <span className="num font-bold">{pct(100 - hw.home)}</span>}
        </span>
        <span className="num min-w-0 truncate text-[11.5px] text-label-2">{readout}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {hw && <span className="num font-bold">{pct(hw.home)}</span>}
          <span className="font-semibold">{home.abbr}</span>
          <TeamLogo abbr={home.abbr} size={18} />
        </span>
      </div>

      <div
        ref={box}
        className="relative mx-3.5 mt-1.5 touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHoverT(null)}
        onPointerCancel={() => setHoverT(null)}
      >
        {w > 0 ? (
          <svg width={w} height={H} className="block overflow-visible" role="img" aria-label={`${mode === 'lead' ? 'Lead' : 'Win probability'} over the game. ${readout}.`}>
            <defs>
              <clipPath id={`up-${uid}`}><rect x="0" y="0" width={w} height={mid} /></clipPath>
              <clipPath id={`dn-${uid}`}><rect x="0" y={mid} width={w} height={H - mid} /></clipPath>
            </defs>
            {Array.from({ length: time.periods }, (_, i) => {
              const s = time.startOf(i + 1);
              const e = time.startOf(i + 2);
              return (
                <g key={i}>
                  {i > 0 && <line x1={x(s)} x2={x(s)} y1={top} y2={top + ih} stroke="var(--sep)" strokeDasharray="2 3" />}
                  <text x={x((s + e) / 2)} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--label-3)">{periodName(i + 1)}</text>
                </g>
              );
            })}
            <text x="2" y={top + 9} fontSize="9.5" fontWeight="600" fill="var(--label-3)">{away.abbr} {mode === 'lead' ? 'ahead' : 'favored'}</text>
            <text x="2" y={top + ih - 2} fontSize="9.5" fontWeight="600" fill="var(--label-3)">{home.abbr} {mode === 'lead' ? 'ahead' : 'favored'}</text>
            <path d={area} fill={a} fillOpacity="0.3" clipPath={`url(#up-${uid})`} />
            <path d={area} fill={h} fillOpacity="0.3" clipPath={`url(#dn-${uid})`} />
            <path d={line} fill="none" stroke={a} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#up-${uid})`} />
            <path d={line} fill="none" stroke={h} strokeWidth="2" strokeLinejoin="round" clipPath={`url(#dn-${uid})`} />
            <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--label-3)" strokeWidth="1" />
            {hv != null ? (
              <>
                <line x1={x(t)} x2={x(t)} y1={top} y2={top + ih} stroke="var(--label-2)" strokeWidth="1" />
                <circle cx={x(t)} cy={y(hv)} r="4.5" fill="var(--label)" stroke="var(--card)" strokeWidth="2" />
              </>
            ) : (
              live && <circle cx={x(end[0])} cy={y(end[1])} r="4.5" fill="var(--live)" stroke="var(--card)" strokeWidth="2" className="live-dot" />
            )}
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}
      </div>

      {flow && (
        <div className="mt-1 flex divide-x divide-sep border-t border-sep py-2.5">
          <Tile team={away} v={flow.best.away?.by ?? 0} sub={flow.best.away ? 'Biggest lead' : 'Never led'} when={flow.best.away?.when} />
          <Tile team={home} v={flow.best.home?.by ?? 0} sub={flow.best.home ? 'Biggest lead' : 'Never led'} when={flow.best.home?.when} />
          <Tile v={flow.changes} sub={`Lead change${flow.changes === 1 ? '' : 's'}`} when={`${flow.ties} tie${flow.ties === 1 ? '' : 's'}`} />
        </div>
      )}
    </Card>
  );
}
