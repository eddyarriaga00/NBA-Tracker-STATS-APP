import { useId, useLayoutEffect, useRef, useState } from 'react';
import { visibleColor } from '../lib/color';
import { fieldGeometry } from '../lib/field';
import { useTheme } from '../lib/theme';

const GLIDE = 'transform 0.8s cubic-bezier(.2,.8,.2,1)';

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** The field drawing. `size` is "sm" (game cards) or "lg" (game page). */
export default function FootballField({ situation, home, away, size = 'lg' }) {
  const { dark } = useTheme();
  const [ref, W] = useWidth();
  const geo = fieldGeometry(situation, home, away);
  const lg = size === 'lg';
  const H = lg ? 96 : 26;
  const clipId = `fld${useId().replace(/:/g, '')}`;
  if (!geo) return <div ref={ref} className="w-full" />; // keep measuring so it can appear later

  const unit = W / 120;
  const ez = unit * 10;
  const fx = (yd) => ez + yd * unit;
  const homeC = visibleColor(home.color, dark, home.alt);
  const awayC = visibleColor(away.color, dark, away.alt);
  const r = lg ? 10 : 6;
  const ballX = fx(geo.ball);
  const ballY = H / 2;

  return (
    <div ref={ref} className="w-full" aria-label={`${geo.offense.abbr} ball, ${situation.full || situation.downDistance}`} role="img">
      {W > 0 && (
        <svg width={W} height={H} className="block">
          <defs>
            <clipPath id={clipId}><rect width={W} height={H} rx={r} /></clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {/* Turf with alternating 10-yard stripes */}
            <rect width={W} height={H} fill={dark ? '#1d5a34' : '#2e7d46'} />
            {Array.from({ length: 10 }, (_, i) =>
              i % 2 ? <rect key={i} x={fx(i * 10)} width={unit * 10} height={H} fill="#ffffff" opacity="0.04" /> : null
            )}
            {/* End zones in team colors (away left, home right) */}
            <rect width={ez} height={H} fill={awayC} />
            <rect x={W - ez} width={ez} height={H} fill={homeC} />
            {lg && (
              <>
                <text x={ez / 2} y={H / 2} fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${ez / 2} ${H / 2})`} letterSpacing="1">{away.abbr}</text>
                <text x={W - ez / 2} y={H / 2} fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(90 ${W - ez / 2} ${H / 2})`} letterSpacing="1">{home.abbr}</text>
              </>
            )}
            {/* Red zone: the 20 yards in front of the defense's goal */}
            {situation.redZone && (
              <rect x={geo.dir > 0 ? fx(80) : fx(0)} width={unit * 20} height={H} fill="#ff3b30" opacity="0.22" />
            )}
            {/* Yard lines + numbers */}
            {Array.from({ length: 11 }, (_, i) => (
              <line key={i} x1={fx(i * 10)} x2={fx(i * 10)} y1="0" y2={H} stroke="#fff" strokeOpacity={i === 0 || i === 10 ? 0.7 : 0.28} strokeWidth={i === 5 ? 1.5 : 1} />
            ))}
            {lg &&
              [10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
                <text key={yd} x={fx(yd)} y={H - 7} fill="#fff" opacity="0.55" fontSize="9" fontWeight="700" textAnchor="middle">
                  {yd <= 50 ? yd : 100 - yd}
                </text>
              ))}
            {/* Drive so far */}
            {geo.start != null && geo.start !== geo.ball && (
              <rect
                x={fx(Math.min(geo.start, geo.ball))}
                width={Math.abs(geo.ball - geo.start) * unit}
                y={lg ? H * 0.3 : H * 0.28}
                height={lg ? H * 0.4 : H * 0.44}
                fill="#fff"
                opacity="0.2"
                rx="2"
              />
            )}
            {/* First-down line (yellow) and line of scrimmage (blue). Moved with
                transforms so they glide to the new spot after each play. */}
            {geo.toGain != null && geo.toGain !== geo.goal && (
              <g style={{ transform: `translateX(${fx(geo.toGain)}px)`, transition: GLIDE }}>
                <line x1="0" x2="0" y1="0" y2={H} stroke="#ffd60a" strokeWidth={lg ? 2.5 : 2} />
              </g>
            )}
            <g style={{ transform: `translateX(${ballX}px)`, transition: GLIDE }}>
              <line x1="0" x2="0" y1="0" y2={H} stroke="#4da3ff" strokeWidth={lg ? 2.5 : 2} />
              {/* Direction arrow + ball */}
              <path
                d={`M ${geo.dir * (lg ? 14 : 9)} ${ballY} l ${-geo.dir * (lg ? 6 : 4)} ${-(lg ? 5 : 3.5)} v ${lg ? 10 : 7} z`}
                fill="#fff"
              />
              <ellipse cx="0" cy={ballY} rx={lg ? 8 : 5.5} ry={lg ? 5 : 3.6} fill="#8b4a22" stroke="#fff" strokeWidth={lg ? 1.2 : 1} />
              {lg && <line x1="-3" x2="3" y1={ballY} y2={ballY} stroke="#fff" strokeWidth="1" />}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
}
