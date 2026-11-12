import { useSyncExternalStore } from 'react';

// Which game's score card should grow into (or shrink back from) the game
// page's header during a page transition. Only one element at a time may carry
// the shared name, so it's kept here instead of on every card.
let current = null;
const subs = new Set();

export function setMorph(id) {
  const next = id == null ? null : String(id);
  if (next === current) return;
  current = next;
  subs.forEach((f) => f());
}

const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** True for the one card that pairs with the game page's header. */
export const useMorph = (id) => useSyncExternalStore(subscribe, () => current === String(id));

/** The name both ends share; the browser animates between elements with the same name. */
export const MORPH_NAME = 'game-hero';

// The score card already knows the teams, score and status, so the game page
// can draw its header from that the instant it opens, before the full game loads.
const seeds = new Map(); // `${league}:${id}` -> the scoreboard's copy of the game

export function seedGame(g) {
  seeds.delete(`${g.league}:${g.id}`);
  seeds.set(`${g.league}:${g.id}`, g);
  if (seeds.size > 80) seeds.delete(seeds.keys().next().value);
}

export const peekGame = (lg, id) => seeds.get(`${lg}:${id}`) ?? null;
