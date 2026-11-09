import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { visibleColor } from '../lib/color';
import { useTheme } from '../lib/theme';
import { Card, TeamLogo } from './ui';

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);

/**
 * Win probability over the game: one line (home team's chance), a neutral 50%
 * midline, and the area between them tinted toward whichever team is favored.
 */
export default function WinProbability({ wp, home, away, live }) {
  const { dark } = useTheme();
  const box = useRef(null);
  const [w, setW] = useState(0); // measured before first paint, so the chart never draws at a wrong size
  const [hover, setHover] = useState(null);
  const uid = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(Math.max(240, Math.round(el.clientWidth)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 150;
  const top = 6;
  const bottom = 20;
  const ih = H - top - bottom;
  const x = (t) => (t / wp.total) * w;
  const y = (p) => top + ((100 - p) / 100) * ih;
  const mid = y(50);

  const { line, area } = useMemo(() => {
    if (!w) return { line: '', area: '' };
    const pts = wp.points.map((p) => [x(p.t), y(p.home)]);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const area = `${line}L${pts.at(-1)[0].toFixed(1)},${mid}L${pts[0][0].toFixed(1)},${mid}Z`;
    return { line, area };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wp, w]);

  const homeC = visibleColor(home.color, dark);
  const awayC = visibleColor(away.color, dark);
  const last = wp.points.at(-1);
  const shown = hover ?? last;
  const homePct = shown.home;
  const awayPct = Math.round((100 - shown.home) * 10) / 10;

  // Period boundaries.
  const marks = [];
  let acc = 0;
  for (let p = 1; p <= wp.periods; p++) {
    const len = p <= 4 ? wp.regLen : wp.otLen;
    marks.push({ p, start: acc, end: acc + len });
    acc += len;
  }

  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * wp.total;
    let best = wp.points[0];
    for (const p of wp.points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    setHover(best);
  };

  const pct = (v) => `${v >= 99.95 ? 100 : v <= 0.05 ? 0 : v.toFixed(v >= 10 && v <= 90 ? 0 : 1)}%`;

  return (
    <Card className="mt-3 px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold text-label-2">Win Probability</div>
        <div className="truncate text-[11.5px] text-label-3">
          {hover ? `${periodName(hover.period)} ${hover.clock}` : live ? 'Now' : 'Final'}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-1.5">
          <TeamLogo abbr={away.abbr} size={18} />
          <span className="font-semibold">{away.abbr}</span>
          <span className="num font-bold">{pct(awayPct)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="num font-bold">{pct(homePct)}</span>
          <span className="font-semibold">{home.abbr}</span>
          <TeamLogo abbr={home.abbr} size={18} />
        </span>
      </div>

      <div
        ref={box}
        className="relative mt-2 touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {w > 0 && <svg width={w} height={H} className="block overflow-visible" role="img" aria-label={`Win probability chart. ${home.abbr} ${pct(last.home)}, ${away.abbr} ${pct(100 - last.home)}.`}>
          <defs>
            <clipPath id={`above-${uid}`}><rect x="0" y="0" width={w} height={mid} /></clipPath>
            <clipPath id={`below-${uid}`}><rect x="0" y={mid} width={w} height={H - mid} /></clipPath>
          </defs>
          {/* Quarter separators and labels */}
          {marks.map((m) => (
            <g key={m.p}>
              {m.p > 1 && <line x1={x(m.start)} x2={x(m.start)} y1={top} y2={top + ih} stroke="var(--sep)" strokeDasharray="2 3" />}
              <text x={x((m.start + m.end) / 2)} y={H - 5} textAnchor="middle" fontSize="10" fill="var(--label-3)">
                {periodName(m.p)}
              </text>
            </g>
          ))}
          {/* Team labels at the edges they represent */}
          <text x="2" y={top + 10} fontSize="10" fontWeight="600" fill="var(--label-3)">{home.abbr}</text>
          <text x="2" y={top + ih - 3} fontSize="10" fontWeight="600" fill="var(--label-3)">{away.abbr}</text>
          {/* 50% midline */}
          <line x1="0" x2={w} y1={mid} y2={mid} stroke="var(--label-3)" strokeWidth="1" />
          {/* Tinted areas: above the midline = home favored, below = away favored */}
          <path d={area} fill={homeC} fillOpacity={dark ? 0.45 : 0.3} clipPath={`url(#above-${uid})`} />
          <path d={area} fill={awayC} fillOpacity={dark ? 0.45 : 0.3} clipPath={`url(#below-${uid})`} />
          <path d={line} fill="none" stroke="var(--label)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* Live end-point / hover crosshair */}
          {hover ? (
            <>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={top} y2={top + ih} stroke="var(--label-2)" strokeWidth="1" />
              <circle cx={x(hover.t)} cy={y(hover.home)} r="4.5" fill="var(--label)" stroke="var(--card)" strokeWidth="2" />
            </>
          ) : (
            live && <circle cx={x(last.t)} cy={y(last.home)} r="4.5" fill="var(--live)" stroke="var(--card)" strokeWidth="2" className="live-dot" />
          )}
        </svg>}
        {!w && <div style={{ height: H }} />}
        {hover && w > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-[200px] rounded-xl border border-sep bg-card/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur"
            style={{ left: Math.min(Math.max(x(hover.t) - 100, 0), w - 200) }}
          >
            <div className="flex justify-between font-semibold">
              <span>{periodName(hover.period)} {hover.clock}</span>
              {hover.away != null && <span className="num">{away.abbr} {hover.away} – {hover.homeScore} {home.abbr}</span>}
            </div>
            {hover.text && <div className="mt-0.5 line-clamp-2 text-label-2">{hover.text}</div>}
          </div>
        )}
      </div>
    </Card>
  );
}
