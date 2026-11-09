import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/** Shows banners from toast(); each disappears after a few seconds. */
export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (e) => {
      const t = e.detail;
      setItems((list) => [...list.slice(-2), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.ms ?? 6000);
    };
    window.addEventListener('toast', on);
    return () => window.removeEventListener('toast', on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(56px+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      {items.map((t) => {
        const body = (
          <div className="rise pointer-events-auto w-full max-w-sm rounded-2xl border border-sep bg-card/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <div className="text-[14px] font-semibold">{t.title}</div>
            {t.body && <div className="mt-0.5 text-[13px] text-label-2">{t.body}</div>}
          </div>
        );
        return t.href ? (
          <Link key={t.id} to={t.href} className="w-full max-w-sm" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
            {body}
          </Link>
        ) : (
          <div key={t.id} className="w-full max-w-sm">{body}</div>
        );
      })}
    </div>
  );
}
