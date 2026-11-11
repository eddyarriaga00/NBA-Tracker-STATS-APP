import { useEffect, useRef, useState } from 'react';

/**
 * [ref, seen]: `seen` turns true once the element is within `margin` pixels of
 * the screen, so heavy sections load only when reached. Checks on scroll as
 * well as with an IntersectionObserver, which can be late when the browser is
 * saving power.
 */
export function useSeen(margin = 300) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const check = () => {
      const el = ref.current; // read each time: the element may be swapped as data arrives
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight + margin && r.bottom > -margin) setSeen(true);
    };
    check();
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(check, { rootMargin: `${margin}px` });
    if (ref.current) io?.observe(ref.current);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const t = setInterval(check, 1500); // the page can grow under a still screen
    return () => {
      io?.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      clearInterval(t);
    };
  }, [seen, margin]);
  return [ref, seen];
}
