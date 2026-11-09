import { useEffect, useState } from 'react';

// Small persisted settings (per device). Every hook instance stays in sync.
const DEFAULTS = { spoilerFree: false, alertsFollowed: false, alertsClose: false, defaultLeague: 'last' };

// Alert moments started out as one "Followed teams" switch; until changed,
// each moment follows that old switch. Which games defaults to "all" unless
// you follow teams.
const fallback = (key) => {
  if (key === 'alertsStart' || key === 'alertsHalf' || key === 'alertsFinal') return read('alertsFollowed');
  // New: on by default for anyone who already turned alerts on.
  if (key === 'alertsBig') return read('alertsFollowed') || read('alertsClose');
  // Each moment now picks its own games: 'off' | 'teams' | 'all'.
  // Until changed, it follows the earlier on/off switch + "Which games".
  const was = { alertsStartFor: 'alertsStart', alertsHalfFor: 'alertsHalf', alertsFinalFor: 'alertsFinal' }[key];
  if (was) return read(was) ? read('alertsScope') : 'off';
  if (key === 'alertsScope') {
    try {
      return JSON.parse(localStorage.getItem('favoriteTeams') || '[]').length ? 'teams' : 'all';
    } catch {
      return 'all';
    }
  }
  return DEFAULTS[key];
};

const read = (key) => {
  try {
    const v = localStorage.getItem(`setting:${key}`);
    return v == null ? fallback(key) : JSON.parse(v);
  } catch {
    return fallback(key);
  }
};

/** All alert choices at once. */
export function alertPrefs() {
  const p = {
    start: read('alertsStartFor'), // 'off' | 'teams' | 'all'
    half: read('alertsHalfFor'),
    final: read('alertsFinalFor'),
    close: read('alertsClose'), // any game
    big: read('alertsBig'), // any game
  };
  const on = (v) => v === 'teams' || v === 'all';
  return { ...p, any: on(p.start) || on(p.half) || on(p.final) || p.close || p.big };
}

/** Live version of alertPrefs() for components. */
export function useAlertPrefs() {
  const [p, setP] = useState(alertPrefs);
  useEffect(() => {
    const on = () => setP(alertPrefs());
    window.addEventListener('settings', on);
    window.addEventListener('favorites', on);
    return () => {
      window.removeEventListener('settings', on);
      window.removeEventListener('favorites', on);
    };
  }, []);
  return p;
}

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
