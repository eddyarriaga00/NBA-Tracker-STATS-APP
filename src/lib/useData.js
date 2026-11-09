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
 */
export function useData(loader, deps, { pollMs = 0, shouldPoll } = {}) {
  // Data is tagged with the deps it was loaded for, so a page never renders
  // with data from the previous page (e.g. an NBA game shown as an NFL game).
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, data: null, error: null, loading: true, updatedAt: 0 });
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
    lastGood.current = null;
    setState({ key: keyRef.current, data: null, error: null, loading: true, updatedAt: 0 });

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

  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : true,
    updatedAt: current ? state.updatedAt : 0,
    reload: () => load(true),
  };
}
