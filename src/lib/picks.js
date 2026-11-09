// Pick'em: everyone picks a winner before each game. Picks live in Supabase
// (supabase/pickem.sql); the server job grades them from ESPN's final scores.
import { useCallback, useEffect, useRef, useState } from 'react';
import { currentSeason } from '../api/espn';
import { commentsEnabled, currentUserId, ensureUser, getClient } from './supabase';

export const picksEnabled = commentsEnabled;

/** A game's picks lock at its scheduled start. */
export const isLocked = (g) => g.status.state !== 'pre' || g.status.postponed || Date.parse(g.date) <= Date.now();

/** Re-fetch whenever anyone's pick in this league changes. */
function useLiveRefresh(league, refresh) {
  useEffect(() => {
    if (!picksEnabled) return;
    let ch;
    let t;
    let alive = true;
    getClient().then((sb) => {
      if (!alive || !sb) return;
      ch = sb
        .channel(`picks:${league}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'picks', filter: `league=eq.${league}` }, () => {
          clearTimeout(t);
          t = setTimeout(refresh, 400);
        })
        .subscribe();
    });
    return () => {
      alive = false;
      clearTimeout(t);
      ch?.unsubscribe();
    };
  }, [league, refresh]);
}

/** Picks for a set of games: { byGame: { [gameId]: rows[] }, me, pick, clear, error }. */
export function usePicks(league, gameIds) {
  const key = [...gameIds].sort().join(',');
  const [byGame, setByGame] = useState({});
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const req = useRef(0);

  const refresh = useCallback(async () => {
    if (!picksEnabled || !key) return;
    const id = ++req.current;
    try {
      const sb = await getClient();
      const [{ data, error: err }, uid] = await Promise.all([
        sb.from('picks').select('user_id,game_id,team_id,nickname,result,updated_at').eq('league', league).in('game_id', key.split(',')),
        currentUserId(),
      ]);
      if (id !== req.current) return;
      if (err) throw err;
      const m = {};
      for (const r of data ?? []) (m[r.game_id] ??= []).push(r);
      setByGame(m);
      setMe(uid);
      setLoaded(true);
    } catch (e) {
      if (id === req.current) setError(e.message || 'Could not load picks.');
    }
  }, [league, key]);

  useEffect(() => {
    setByGame({});
    setLoaded(false);
    refresh();
  }, [refresh]);
  useLiveRefresh(league, refresh);

  // Refresh when games lock so friends' picks appear right at tip-off.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', on);
    const timer = setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', on);
      clearInterval(timer);
    };
  }, [refresh]);

  const setLocal = (gameId, fn) => setByGame((m) => ({ ...m, [gameId]: fn(m[gameId] ?? []) }));

  const pick = async (g, teamId, nickname) => {
    setError('');
    if (isLocked(g)) return setError('Picks for this game are locked.');
    const user = await ensureUser().catch((e) => {
      setError(e.message);
      return null;
    });
    if (!user) return;
    setMe(user.id);
    const prev = byGame[g.id] ?? [];
    setLocal(g.id, (rows) => [...rows.filter((r) => r.user_id !== user.id), { user_id: user.id, game_id: g.id, team_id: teamId, nickname, result: null }]);
    const sb = await getClient();
    const { error: err } = await sb
      .from('picks')
      .upsert({ league, game_id: String(g.id), team_id: String(teamId), nickname, game_start: new Date(g.date).toISOString() }, { onConflict: 'user_id,league,game_id' });
    if (err) {
      setLocal(g.id, () => prev);
      setError(/row-level security|violates/i.test(err.message) ? 'Picks for this game are locked.' : err.message);
    }
  };

  const clear = async (g) => {
    setError('');
    const uid = me ?? (await currentUserId());
    if (!uid || isLocked(g)) return;
    const prev = byGame[g.id] ?? [];
    setLocal(g.id, (rows) => rows.filter((r) => r.user_id !== uid));
    const sb = await getClient();
    const { error: err } = await sb.from('picks').delete().eq('league', league).eq('game_id', String(g.id)).eq('user_id', uid);
    if (err) {
      setLocal(g.id, () => prev);
      setError(err.message);
    }
  };

  return { byGame, me, pick, clear, error, loaded };
}

// ---------- leaderboard ----------

export const PERIODS = [
  { value: 'week', label: 'This Week' },
  { value: 'season', label: 'Season' },
  { value: 'all', label: 'All Time' },
];

function since(league, period) {
  if (period === 'all') return null;
  if (period === 'week') return new Date(Date.now() - 7 * 86400_000);
  const s = currentSeason(league);
  return league === 'nba' ? new Date(s - 1, 9, 1) : new Date(s, 7, 1); // NBA from Oct 1, NFL from Aug 1
}

/** Rank people by wins, then win %, from graded picks. Exported for testing. */
export function standingsFrom(rows) {
  const users = {};
  const sorted = [...rows].sort((a, b) => Date.parse(b.game_start) - Date.parse(a.game_start));
  for (const r of sorted) {
    const u = (users[r.user_id] ??= { user_id: r.user_id, nickname: r.nickname, w: 0, l: 0, p: 0, streak: 0, streakType: null, done: false, last: [] });
    if (r.result === 'win') u.w++;
    else if (r.result === 'loss') u.l++;
    else if (r.result === 'push') u.p++;
    if (r.result === 'win' || r.result === 'loss') {
      if (u.last.length < 5) u.last.push(r.result);
      if (!u.done) {
        if (!u.streakType) u.streakType = r.result;
        if (r.result === u.streakType) u.streak++;
        else u.done = true;
      }
    }
  }
  return Object.values(users)
    .filter((u) => u.w + u.l + u.p > 0)
    .map((u) => ({ ...u, pct: u.w + u.l ? u.w / (u.w + u.l) : 0 }))
    .sort((a, b) => b.w - a.w || b.pct - a.pct || a.l - b.l || a.nickname.localeCompare(b.nickname));
}

export function useLeaderboard(league, period) {
  const [state, setState] = useState({ rows: null, me: null, error: '' });
  const req = useRef(0);
  const refresh = useCallback(async () => {
    if (!picksEnabled) return;
    const id = ++req.current;
    try {
      const sb = await getClient();
      const from = since(league, period);
      const all = [];
      for (let page = 0; page < 20; page++) {
        let q = sb
          .from('picks')
          .select('user_id,nickname,result,game_start')
          .eq('league', league)
          .not('result', 'is', null)
          .order('game_start', { ascending: false })
          .range(page * 1000, page * 1000 + 999);
        if (from) q = q.gte('game_start', from.toISOString());
        const { data, error } = await q;
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const me = await currentUserId();
      if (id === req.current) setState({ rows: standingsFrom(all), me, error: '' });
    } catch (e) {
      if (id === req.current) setState((s) => ({ ...s, error: e.message || 'Could not load the leaderboard.' }));
    }
  }, [league, period]);
  useEffect(() => {
    setState({ rows: null, me: null, error: '' });
    refresh();
  }, [refresh]);
  useLiveRefresh(league, refresh);
  return state;
}
