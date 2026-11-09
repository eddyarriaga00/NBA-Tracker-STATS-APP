import { useMemo, useState } from 'react';
import { visibleColor } from '../lib/color';
import { useTheme } from '../lib/theme';
import { Card, Segmented } from './ui';

// Half court in feet. ESPN puts the hoop at (25, 0); the baseline is 5.25 ft behind it.
const HOOP_Y = 5.25; // hoop distance from baseline
const W = 50;
const H = 47; // baseline to half-court line
const toY = (y) => y + HOOP_Y; // ESPN y (from hoop) -> court y (from baseline)
const ARC_R = 23.75;
const CORNER_X = 3; // corner three is 22 ft: 25 - 22
const cornerY = HOOP_Y + Math.sqrt(ARC_R ** 2 - (25 - CORNER_X) ** 2);

const periodName = (n) => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const dist = (s) => Math.hypot(s.x - 25, s.y);
// Zones: restricted area/paint, mid-range, and three.
const zoneOf = (s) => (s.three ? '3PT' : Math.abs(s.x - 25) <= 8 && toY(s.y) <= 19 ? 'Paint' : 'Mid-range');

function Court({ line }) {
  const s = { fill: 'none', stroke: line, strokeWidth: 0.25 };
  return (
    <g>
      <rect x="0" y="0" width={W} height={H} {...s} />
      {/* Lane, free-throw circle, restricted area, backboard, hoop */}
      <rect x={17} y={0} width={16} height={19} {...s} />
      <circle cx={25} cy={19} r={6} {...s} />
      <path d={`M ${25 - 4} ${HOOP_Y} A 4 4 0 0 0 ${25 + 4} ${HOOP_Y}`} {...s} />
      <line x1={22} x2={28} y1={4} y2={4} {...s} strokeWidth={0.35} />
      <circle cx={25} cy={HOOP_Y} r={0.75} {...s} strokeWidth={0.3} />
      {/* Three-point line: straight corners, then the arc */}
      <line x1={CORNER_X} x2={CORNER_X} y1={0} y2={cornerY} {...s} />
      <line x1={W - CORNER_X} x2={W - CORNER_X} y1={0} y2={cornerY} {...s} />
      <path d={`M ${CORNER_X} ${cornerY} A ${ARC_R} ${ARC_R} 0 0 0 ${W - CORNER_X} ${cornerY}`} {...s} />
      {/* Half-court circle */}
      <path d={`M ${25 - 6} ${H} A 6 6 0 0 1 ${25 + 6} ${H}`} {...s} />
    </g>
  );
}

/** Where every shot came from, for one team, with player and quarter filters. */
export default function ShotChart({ g }) {
  const { dark } = useTheme();
  const [side, setSide] = useState('away');
  const [player, setPlayer] = useState('all');
  const [period, setPeriod] = useState('all');
  const [picked, setPicked] = useState(null);
  const team = g[side];
  const color = visibleColor(team.color, dark, team.alt);

  const box = g.box.find((b) => b.teamId === team.id);
  const names = Object.fromEntries((box?.athletes ?? []).map((a) => [a.id, a.short]));
  const teamShots = useMemo(() => g.shots.filter((s) => s.teamId === team.id), [g.shots, team.id]);
  const shooters = useMemo(() => {
    const c = {};
    for (const s of teamShots) c[s.playerId] = (c[s.playerId] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [teamShots]);
  const periods = [...new Set(g.shots.map((s) => s.period))].sort((a, b) => a - b);
  const shots = teamShots.filter((s) => (player === 'all' || s.playerId === player) && (period === 'all' || s.period === Number(period)));

  // Missed end-of-quarter heaves aren't official attempts (they still show on the court).
  const counted = shots.filter((s) => s.made || !/heave/i.test(s.text));
  const zones = ['Paint', 'Mid-range', '3PT'].map((z) => {
    const list = counted.filter((s) => zoneOf(s) === z);
    const made = list.filter((s) => s.made).length;
    return { z, made, att: list.length };
  });
  const made = counted.filter((s) => s.made).length;
  const pct = (m, a) => (a ? `${Math.round((m / a) * 100)}%` : '–');

  if (!g.shots?.length) return <Card className="py-10 text-center text-label-2">Shot locations aren’t available for this game yet.</Card>;

  const sel = shots.find((s) => s.id === picked);
  return (
    <div>
      <Segmented
        className="mb-3"
        value={side}
        onChange={(v) => { setSide(v); setPlayer('all'); setPicked(null); }}
        options={[{ value: 'away', label: g.away.name }, { value: 'home', label: g.home.name }]}
      />
      <div className="mb-3 flex gap-2">
        <select
          value={player}
          onChange={(e) => { setPlayer(e.target.value); setPicked(null); }}
          className="min-w-0 flex-1 rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold outline-none"
          aria-label="Player"
        >
          <option value="all">All players</option>
          {shooters.map((id) => <option key={id} value={id}>{names[id] ?? 'Player'}</option>)}
        </select>
        <select
          value={period}
          onChange={(e) => { setPeriod(e.target.value); setPicked(null); }}
          className="rounded-full bg-fill px-3 py-1.5 text-[13px] font-semibold outline-none"
          aria-label="Quarter"
        >
          <option value="all">Full game</option>
          {periods.map((p) => <option key={p} value={p}>{periodName(p)}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden p-3">
        <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} className="block w-full" role="img" aria-label={`${team.name} shot chart: ${made} of ${counted.length} made`}>
          <rect x="-1" y="-1" width={W + 2} height={H + 2} fill={dark ? '#2a2118' : '#f3e7d3'} rx="1" />
          <Court line={dark ? 'rgba(255,255,255,0.45)' : 'rgba(80,55,30,0.55)'} />
          {shots.map((s) => {
            const cx = Math.max(0.6, Math.min(W - 0.6, s.x));
            const cy = Math.max(0.6, Math.min(H - 0.6, toY(s.y)));
            const active = s.id === picked;
            return s.made ? (
              <circle key={s.id} cx={cx} cy={cy} r={active ? 1.3 : 0.85} fill={color} stroke={dark ? '#000' : '#fff'} strokeWidth="0.2" onClick={() => setPicked(s.id)} style={{ cursor: 'pointer' }} />
            ) : (
              <g key={s.id} onClick={() => setPicked(s.id)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={cy} r={1.4} fill="transparent" />
                <path d={`M ${cx - 0.6} ${cy - 0.6} L ${cx + 0.6} ${cy + 0.6} M ${cx + 0.6} ${cy - 0.6} L ${cx - 0.6} ${cy + 0.6}`} stroke={dark ? 'rgba(255,255,255,0.7)' : 'rgba(60,40,20,0.65)'} strokeWidth={active ? 0.45 : 0.3} />
              </g>
            );
          })}
        </svg>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11.5px] text-label-2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> Made</span>
          <span className="flex items-center gap-1.5"><span className="text-[13px] leading-none">×</span> Missed</span>
        </div>
        {sel && (
          <div className="mt-2 rounded-lg bg-card-2 px-3 py-2 text-[12.5px]">
            <span className="font-semibold">{periodName(sel.period)} {sel.clock}</span>
            <span className="text-label-2"> · {Math.round(dist(sel))} ft · {sel.text}</span>
          </div>
        )}
      </Card>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[{ z: 'Total', made, att: counted.length }, ...zones].map((x) => (
          <Card key={x.z} className="px-2 py-2.5 text-center">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-label-2">{x.z}</div>
            <div className="num mt-0.5 font-display text-[17px] font-bold">{x.made}/{x.att}</div>
            <div className="num text-[11px] text-label-2">{pct(x.made, x.att)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
