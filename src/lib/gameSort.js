import { useEffect, useState } from 'react';

// How games are ordered on the Scores page. To change the default order, edit
// GROUP_ORDER / the per-group comparators below, or DEFAULT_SORT.

export const SORTS = {
  live: { label: 'Live first' },
  time: { label: 'Start time' },
};
export const DEFAULT_SORT = 'live';

// "Live first": which group comes first, and how each group is ordered.
const GROUP_ORDER = ['in', 'post', 'pre'];
const GROUP_TITLE = { in: 'Live', post: 'Final', pre: 'Upcoming' };
const byStart = (a, b) => new Date(a.date) - new Date(b.date);
const WITHIN = {
  in: byStart, // live: earliest tip-off first (usually furthest along)
  post: (a, b) => -byStart(a, b), // finished: newest first, oldest at the bottom
  pre: byStart, // upcoming: soonest first
};

const dayLabel = (d) => new Date(d).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const stateOf = (g) => (g.status.postponed ? 'pre' : g.status.state);

/**
 * Splits games into titled sections.
 * @param byDay  group finished/upcoming games under day headers (NFL weeks span days)
 * @param isFav  (game) => boolean; followed teams go first within each group
 */
export function sectionGames(games, mode, { byDay = false, isFav = () => false } = {}) {
  const favFirst = (cmp) => (a, b) => (isFav(b) ? 1 : 0) - (isFav(a) ? 1 : 0) || cmp(a, b);

  if (mode === 'time') {
    const sorted = [...games].sort(favFirst(byStart));
    if (!byDay) return [{ key: 'all', title: '', games: sorted }];
    const days = new Map();
    for (const g of [...games].sort(byStart)) {
      const k = dayLabel(g.date);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(g);
    }
    return [...days.entries()].map(([title, list]) => ({ key: title, title, games: list.sort(favFirst(byStart)) }));
  }

  const sections = [];
  for (const state of GROUP_ORDER) {
    const list = games.filter((g) => stateOf(g) === state).sort(favFirst(WITHIN[state]));
    if (!list.length) continue;
    if (!byDay || state === 'in') {
      sections.push({ key: state, title: GROUP_TITLE[state], live: state === 'in', games: list });
      continue;
    }
    // Keep the group's order but break it into day headers.
    const days = new Map();
    for (const g of list) {
      const k = dayLabel(g.date);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(g);
    }
    for (const [day, dayGames] of days) {
      sections.push({ key: `${state}:${day}`, title: `${GROUP_TITLE[state]} · ${day}`, games: dayGames });
    }
  }
  return sections;
}

const read = () => {
  try {
    const v = localStorage.getItem('gameSort');
    return SORTS[v] ? v : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
};

export function useGameSort() {
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const on = () => setMode(read());
    window.addEventListener('gameSort', on);
    return () => window.removeEventListener('gameSort', on);
  }, []);
  const set = (m) => {
    try { localStorage.setItem('gameSort', m); } catch { /* ignore */ }
    window.dispatchEvent(new Event('gameSort'));
  };
  return [mode, set];
}
