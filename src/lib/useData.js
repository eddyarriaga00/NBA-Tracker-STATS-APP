import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data with `loader(fresh)`. Re-polls every `pollMs` while
 * `shouldPoll(data)` is true and the tab is visible.
 */
export function useData(loader, deps, { pollMs = 0, shouldPoll = () => true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const pollRef = useRef(shouldPoll);
  pollRef.current = shouldPoll;

  const load = useCallback(async (fresh = false) => {
    try {
      const data = await loaderRef.current(fresh);
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer;
    setState((s) => ({ data: null, error: null, loading: true }));
    const tick = async (fresh) => {
      const data = await load(fresh);
      if (!alive || !pollMs) return;
      if (data && pollRef.current(data)) {
        timer = setTimeout(() => {
          if (document.visibilityState === 'visible') tick(true);
          else timer = setTimeout(() => tick(true), pollMs);
        }, pollMs);
      }
    };
    tick(false);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: () => load(true) };
}
