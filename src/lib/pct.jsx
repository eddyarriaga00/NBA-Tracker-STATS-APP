// Made-over-tries stats ("11-19", "19/31") also show their percentage.
const COLS = /^(FG|3PT|FT|C\/ATT|CMP\/ATT|XP|FGM-FGA|3PM-3PA|FTM-FTA|XPM-XPA)$/i;

export function madePct(label, v) {
  if (!COLS.test(String(label ?? '').trim())) return '';
  const m = /^(\d+)\s*[-/]\s*(\d+)$/.exec(String(v ?? '').trim());
  if (!m || +m[2] === 0) return '';
  return `${Math.round((+m[1] / +m[2]) * 100)}%`;
}

/** The value with its percentage in small type underneath. */
export function WithPct({ label, v, className = 'block text-[10px] font-normal leading-none text-label-3' }) {
  const p = madePct(label, v);
  return (
    <>
      {v}
      {p && <span className={className}>{p}</span>}
    </>
  );
}
