import { useEffect, useState } from 'react';

/** "Updated 3s ago" for live pages, ticking every second; warns when stale. */
export default function Freshness({ updatedAt, error, className = '' }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!updatedAt) return null;
  const age = Math.max(0, Math.round((now - updatedAt) / 1000));
  const stale = age > 20;
  const label = age < 2 ? 'Updated just now' : age < 60 ? `Updated ${age}s ago` : `Updated ${Math.floor(age / 60)}m ago`;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] num ${stale ? 'text-[#c26a00] dark:text-[#ffb340]' : 'text-label-3'} ${className}`} aria-live="off">
      <span className={`h-[6px] w-[6px] rounded-full ${stale ? 'bg-[#ff9f0a]' : 'bg-win live-dot'}`} />
      {stale && error ? 'Reconnecting… ' : ''}
      {label}
    </span>
  );
}
