const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Icon = {
  Scores: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18M6 5.6c2.7 3.5 2.7 9.3 0 12.8M18 5.6c-2.7 3.5-2.7 9.3 0 12.8" />
    </svg>
  ),
  Standings: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.6" />
    </svg>
  ),
  Leaders: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 6h2.5a1.5 1.5 0 0 1 0 3.5H17M7 6H4.5a1.5 1.5 0 0 0 0 3.5H7" />
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  Moon: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  ),
  Auto: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" {...base} strokeWidth="2.4" {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
  ChevronLeft: (p) => (
    <svg viewBox="0 0 24 24" {...base} strokeWidth="2.4" {...p}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  ),
  ChevronRight: (p) => (
    <svg viewBox="0 0 24 24" {...base} strokeWidth="2.4" {...p}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  ),
  Calendar: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  Refresh: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M20 11a8 8 0 0 0-14.7-4.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.3L20 16M20 20v-4h-4" />
    </svg>
  ),
  Star: ({ filled, ...p }) => (
    <svg viewBox="0 0 24 24" {...base} fill={filled ? 'currentColor' : 'none'} {...p}>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />
    </svg>
  ),
  Teams: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
    </svg>
  ),
  Chat: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M20.5 11.5c0 4.4-3.8 8-8.5 8-1.3 0-2.6-.3-3.7-.8L3.5 20l1.4-3.9A7.6 7.6 0 0 1 3.5 11.5c0-4.4 3.8-8 8.5-8s8.5 3.6 8.5 8Z" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" {...base} strokeWidth="2.2" {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.6-4.6" />
    </svg>
  ),
  X: (p) => (
    <svg viewBox="0 0 24 24" {...base} strokeWidth="2.2" {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Send: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 3.5a1 1 0 0 1 .7.3l6 6a1 1 0 1 1-1.4 1.4L13 6.9V20a1 1 0 1 1-2 0V6.9l-4.3 4.3a1 1 0 1 1-1.4-1.4l6-6a1 1 0 0 1 .7-.3Z" />
    </svg>
  ),
  External: (p) => (
    <svg viewBox="0 0 24 24" {...base} {...p}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  ),
};
