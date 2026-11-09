import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoUrl } from '../api/espn';
import { useLeague } from '../lib/league';
import { useTheme } from '../lib/theme';

export function TeamLogo({ abbr, size = 32, className = '', league }) {
  const { dark } = useTheme();
  const ctx = useLeague();
  const [failed, setFailed] = useState(0); // 0 ok, 1 dark variant failed, 2 both failed
  useEffect(() => setFailed(0), [abbr, dark]);
  const src = logoUrl(league ?? ctx, abbr, dark && failed === 0);
  if (!abbr || abbr === 'TBD' || failed >= 2) {
    return (
      <span
        aria-hidden
        className={`grid h-[var(--s)] w-[var(--s)] shrink-0 place-items-center rounded-full bg-fill text-[10px] font-bold text-label-3 ${className}`}
        style={{ '--s': `${size}px` }}
      >
        {abbr && abbr !== 'TBD' ? abbr.slice(0, 3) : '?'}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed((f) => (dark && f === 0 ? 1 : 2))}
      className={`h-[var(--s)] w-[var(--s)] shrink-0 object-contain ${className}`}
      style={{ '--s': `${size}px` }}
    />
  );
}

export function Headshot({ src, size = 40, className = '' }) {
  const [failed, setFailed] = useState(!src);
  return (
    <div
      className={`h-[var(--s)] w-[var(--s)] shrink-0 overflow-hidden rounded-full bg-fill ${className}`}
      style={{ '--s': `${size}px` }}
    >
      {!failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-top"
          style={{ transform: 'scale(1.35) translateY(8%)' }}
        />
      )}
    </div>
  );
}

export function Card({ children, className = '', ...rest }) {
  return (
    <div className={`rounded-2xl bg-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right, className = '' }) {
  return (
    <div className={`mb-2 mt-6 flex items-baseline justify-between px-1 md:mt-7 ${className}`}>
      <h2 className="font-display text-[19px] font-bold tracking-tight md:text-[22px]">{children}</h2>
      {right}
    </div>
  );
}

/** iOS-style segmented control. */
export function Segmented({ options, value, onChange, className = '' }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="tablist"
      className={`relative grid rounded-[10px] bg-fill p-[2px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <div
        aria-hidden
        className="absolute bottom-[2px] top-[2px] rounded-[8px] bg-card shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] dark:bg-[#636366]"
        style={{
          left: 2,
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 truncate px-2 py-[6px] text-[12.5px] font-semibold transition-colors md:px-3 md:py-[7px] md:text-[13px] ${
            o.value === value ? 'text-label' : 'text-label-2 hover:text-label'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LiveBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-live">
      <span className="live-dot h-[7px] w-[7px] rounded-full bg-live" />
      {label}
    </span>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export function ErrorState({ error, onRetry }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="text-[15px] font-semibold">{error?.notFound ? 'Not found' : "Couldn't load data"}</div>
      <div className="text-[13px] text-label-2">{error?.message ?? 'Check your connection.'}</div>
      {onRetry && !error?.notFound && (
        <button
          onClick={onRetry}
          className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white active:opacity-70"
        >
          Try Again
        </button>
      )}
    </Card>
  );
}

export function Empty({ title, subtitle }) {
  return (
    <Card className="px-6 py-12 text-center">
      <div className="text-[17px] font-semibold">{title}</div>
      {subtitle && <div className="mt-1 text-[14px] text-label-2">{subtitle}</div>}
    </Card>
  );
}

export function PageTitle({ eyebrow, children, right }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        {eyebrow && (
          <div className="truncate text-[11.5px] font-semibold uppercase tracking-wide text-label-2 md:text-[13px]">{eyebrow}</div>
        )}
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight md:text-[34px]">{children}</h1>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2 pb-1.5">{right}</div>}
    </div>
  );
}

export function BackButton({ label = 'Back', fallback = '/' }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback))}
      className="mb-2 -ml-1 flex items-center gap-0.5 text-[16px] text-accent active:opacity-60 md:mb-3 md:text-[17px]"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
      {label}
    </button>
  );
}

/** Horizontal chip picker (categories, weeks). */
export function Chips({ options, value, onChange, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector('[data-active]');
    if (el && (el.offsetLeft < box.scrollLeft || el.offsetLeft + el.clientWidth > box.scrollLeft + box.clientWidth)) {
      box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    }
  }, [value, options.length]);
  return (
    <div ref={ref} className={`no-scrollbar relative -mx-3 flex gap-2 overflow-x-auto px-3 md:-mx-4 md:px-4 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          data-active={o.value === value || undefined}
          onClick={() => onChange(o.value)}
          className={`shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition active:scale-95 md:px-4 md:py-1.5 md:text-[14px] ${
            o.value === value ? 'bg-label text-bg' : 'bg-card text-label-2 hover:text-label'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Compact season dropdown. Native <select> so phones get their own picker. */
export function SeasonPicker({ options, value, onChange, className = '' }) {
  return (
    <label className={`relative inline-flex shrink-0 items-center ${className}`}>
      <span className="sr-only">Season</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cursor-pointer appearance-none rounded-full bg-fill py-1 pl-3 pr-7 text-[13px] font-semibold text-label outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-label-2" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </label>
  );
}
