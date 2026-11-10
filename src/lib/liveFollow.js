// "Follow live": one score notification for a game that keeps updating.
// Needs alerts switched on for this device (it uses the same subscription).
import { useCallback, useEffect, useState } from 'react';
import { pushConfigured, pushSupported } from './push';
import { ensureUser, getClient } from './supabase';

export const liveFollowAvailable = () => pushConfigured && pushSupported();

async function endpoint() {
  const reg = await navigator.serviceWorker.getRegistration('./');
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

/**
 * [every, setEvery] for one game on this device.
 * every: undefined while loading, null when not following, else 20 | 60 | 180 (seconds between updates).
 * setEvery throws 'no-alerts' if alerts aren't on for this device.
 */
export function useLiveFollow(league, id) {
  const key = `${league}:${id}`;
  const [every, setEvery] = useState(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!liveFollowAvailable()) return null;
      const ep = await endpoint();
      if (!ep) return null;
      await ensureUser();
      const sb = await getClient();
      return (await sb.rpc('get_live_follow', { p_endpoint: ep, p_game: key })).data ?? null;
    })()
      .then((v) => alive && setEvery(v))
      .catch(() => alive && setEvery(null));
    return () => { alive = false; };
  }, [key]);

  const set = useCallback(async (next) => {
    const ep = await endpoint();
    if (!ep) throw new Error('no-alerts');
    await ensureUser();
    const sb = await getClient();
    const { error } = await sb.rpc('set_live_follow', { p_endpoint: ep, p_game: key, p_every: next });
    if (error) throw new Error(/Turn on alerts/.test(error.message) ? 'no-alerts' : error.message);
    setEvery(next);
  }, [key]);
  return [every, set];
}
