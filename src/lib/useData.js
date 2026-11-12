import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with `loader(fresh)` whenever `deps` change.
 *
 * - `pollMs` is a number, or a function of the latest data returning the delay
 *   in ms (0 = stop). This lets live games refresh every few seconds and
 *   finished ones not at all.
 * - Ignores responses from older requests, so quickly switching days or games
 *   never shows stale data. Requests never overlap.
 * - A failed refresh keeps the last good data on screen and polling continues.
 * - Pauses while the tab is hidden and refreshes right away when it comes back.
 * - Returns `updatedAt` (ms) so the page can show how fresh the data is.
 * - `remember` (a unique name for this data) keeps the last result for the
 *   session, so coming back to a page shows it at once, in place, and then
 *   refreshes it, instead of starting from a blank loading state.
 */
const remembered = new Map(); // name -> { data, at }

export function useData(loader, deps, { pollMs = 0, shouldPoll, remember = '' } = {}) {
  // Data is tagged with the deps it was loaded for, so a page never renders
  // with data from the previous page (e.g. an NBA game shown as an NFL game).
  const key = JSON.stringify(deps);
  const start = () => {
    const had = remember ? remembered.get(remember) : null;
    return had ? { key, data: had.data, error: null, loading: false, updatedAt: had.at } : { key, data: null, error: null, loading: true, updatedAt: 0 };
  };
  const [state, setState] = useState(start);
  const startRef = useRef(start);
  startRef.current = start;
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const keyRef = useRef(key);
  keyRef.current = key;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const delayRef = useRef(null);
  delayRef.current = (d) => {
    if (typeof pollMs === 'function') return pollMs(d) || 0;
    if (!pollMs) return 0;
    return !shouldPoll || shouldPoll(d) ? pollMs : 0;
  };
  const reqId = useRef(0);
  const lastGood = useRef(null);

  const load = useCallback(async (fresh = false) => {
    const id = ++reqId.current;
    try {
      const data = await loaderRef.current(fresh);
      if (id !== reqId.current) return lastGood.current; // a newer request superseded this one
      lastGood.current = data;
      if (rememberRef.current) remembered.set(rememberRef.current, { data, at: Date.now() });
      setState({ key: keyRef.current, data, error: null, loading: false, updatedAt: Date.now() });
      return data;
    } catch (error) {
      if (id === reqId.current) setState((s) => ({ ...s, key: keyRef.current, error, loading: false }));
      return lastGood.current;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    let running = false;
    const begin = startRef.current();
    lastGood.current = begin.data;
    setState(begin);

    const schedule = () => {
      clearTimeout(timer);
      if (!alive || !lastGood.current) return;
      const delay = delayRef.current(lastGood.current);
      if (!delay) return;
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') tick(true);
        // While hidden, wait for onVisible to pick it back up.
      }, delay);
    };
    const tick = async (fresh) => {
      if (running) return; // never overlap requests
      running = true;
      try {
        await load(fresh);
      } finally {
        running = false;
      }
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !alive) return;
      // Refresh immediately when returning to the app (data may be minutes old).
      if (lastGood.current && delayRef.current(lastGood.current)) {
        clearTimeout(timer);
        tick(true);
      }
    };

    tick(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      reqId.current++; // drop any in-flight response for the old deps
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // The render right after the deps change still holds the old page's state.
  const shown = state.key === key ? state : start();
  const current = shown.key === key;
  return {
    data: current ? shown.data : null,
    error: current ? shown.error : null,
    loading: current ? shown.loading : true,
    updatedAt: current ? shown.updatedAt : 0,
    reload: () => load(true),
  };
}
