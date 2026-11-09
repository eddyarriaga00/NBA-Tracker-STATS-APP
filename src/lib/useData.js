import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with `loader(fresh)` whenever `deps` change.
 *
 * - Ignores responses from older requests, so quickly switching days or
 *   games never shows stale data.
 * - Re-polls every `pollMs` while `shouldPoll(lastGoodData)` is true. A failed
 *   request keeps the last good data on screen and polling continues.
 * - Pauses while the tab is hidden and refreshes right away when it comes back.
 */
export function useData(loader, deps, { pollMs = 0, shouldPoll = () => true } = {}) {
  // Data is tagged with the deps it was loaded for, so a page never renders
  // with data from the previous page (e.g. an NBA game shown as an NFL game).
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key, data: null, error: null, loading: true });
  const keyRef = useRef(key);
  keyRef.current = key;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const pollRef = useRef(shouldPoll);
  pollRef.current = shouldPoll;
  const reqId = useRef(0);
  const lastGood = useRef(null);

  const load = useCallback(async (fresh = false) => {
    const id = ++reqId.current;
    try {
      const data = await loaderRef.current(fresh);
      if (id !== reqId.current) return lastGood.current; // a newer request superseded this one
      lastGood.current = data;
      setState({ key: keyRef.current, data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === reqId.current) setState((s) => ({ ...s, key: keyRef.current, error, loading: false }));
      return lastGood.current;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    lastGood.current = null;
    setState({ key: keyRef.current, data: null, error: null, loading: true });

    const schedule = () => {
      clearTimeout(timer);
      if (!alive || !pollMs) return;
      if (lastGood.current && pollRef.current(lastGood.current)) {
        timer = setTimeout(() => {
          if (document.visibilityState === 'visible') tick(true);
          // While hidden, wait for onVisible to pick it back up.
        }, pollMs);
      }
    };
    const tick = async (fresh) => {
      await load(fresh);
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !alive) return;
      // Refresh immediately when returning to the app (data may be minutes old).
      if (pollMs && lastGood.current && pollRef.current(lastGood.current)) tick(true);
    };

    tick(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      alive = false;
      reqId.current++; // drop any in-flight response for the old deps
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : true,
    reload: () => load(true),
  };
}
