import { useEffect, useState } from 'react';

// Small persisted settings (per device). Every hook instance stays in sync.
const DEFAULTS = { spoilerFree: false, alertsFollowed: false, alertsClose: false, defaultLeague: 'last' };

const read = (key) => {
  try {
    const v = localStorage.getItem(`setting:${key}`);
    return v == null ? DEFAULTS[key] : JSON.parse(v);
  } catch {
    return DEFAULTS[key];
  }
};

export function getSetting(key) {
  return read(key);
}

export function useSetting(key) {
  const [value, setValue] = useState(() => read(key));
  useEffect(() => {
    const on = () => setValue(read(key));
    window.addEventListener('settings', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('settings', on);
      window.removeEventListener('storage', on);
    };
  }, [key]);
  const set = (v) => {
    try { localStorage.setItem(`setting:${key}`, JSON.stringify(v)); } catch { /* ignore */ }
    window.dispatchEvent(new Event('settings'));
  };
  return [value, set];
}

// ---------- spoilers ----------
// Revealed games are remembered for this browsing session only.
const readRevealed = () => {
  try { return new Set(JSON.parse(sessionStorage.getItem('revealed') || '[]')); } catch { return new Set(); }
};

export function useSpoilers() {
  const [on] = useSetting('spoilerFree');
  const [revealed, setRevealed] = useState(readRevealed);
  useEffect(() => {
    const sync = () => setRevealed(readRevealed());
    window.addEventListener('revealed', sync);
    return () => window.removeEventListener('revealed', sync);
  }, []);
  const reveal = (key) => {
    const next = new Set(readRevealed());
    next.add(key);
    try { sessionStorage.setItem('revealed', JSON.stringify([...next])); } catch { /* ignore */ }
    window.dispatchEvent(new Event('revealed'));
  };
  /** True when this game's result should be hidden. */
  const hidden = (g) => on && g && g.status?.state !== 'pre' && !revealed.has(`${g.league}:${g.id}`);
  return { on, hidden, reveal: (g) => reveal(`${g.league}:${g.id}`) };
}
