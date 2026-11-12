import { useEffect, useRef } from 'react';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * A number whose digits roll to their new value, like a scoreboard. Each digit
 * is a strip of 0-9 that slides; only the digits that change move. The colour
 * also flashes briefly so a change is hard to miss.
 */
export default function RollingNumber({ value, className = '' }) {
  const text = String(value ?? 0);
  const box = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = box.current;
    if (!el) return;
    el.classList.remove('score-flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('score-flash');
  }, [text]);
  return (
    <span ref={box} className={`inline-flex leading-none ${className}`} role="text" aria-label={text}>
      {text.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          // Keyed from the right, so the ones digit stays the ones digit when 99 becomes 100.
          <span key={text.length - i} aria-hidden className="relative inline-block h-[1em] overflow-hidden">
            <span className="flex flex-col transition-transform duration-500 ease-out" style={{ transform: `translateY(-${ch}em)` }}>
              {DIGITS.map((d) => <span key={d} className="h-[1em] leading-none">{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={`c${i}`} aria-hidden>{ch}</span>
        )
      )}
    </span>
  );
}
