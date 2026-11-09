import { useEffect, useRef } from 'react';
import { getNbaScoreboard, getNflScoreboard, toKey } from '../api/espn';
import { gameHeat } from './excitement';
import { useFavorites } from './favorites';
import { getSetting, useAlertPrefs } from './settings';
import { toast } from './toast';
import { pushActive } from './push';

// Watches today's NBA games and this week's NFL games while the app is open and
// raises alerts for followed teams (start + final) and close games late.

const LIVE_POLL = 15_000;
const IDLE_POLL = 60_000;
const SENT_KEY = 'alertsSent';
const KEEP_MS = 3 * 24 * 60 * 60 * 1000;

function loadSent() {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
    const now = Date.now();
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => now - t < KEEP_MS));
  } catch {
    return {};
  }
}
function saveSent(sent) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch { /* ignore */ }
}

function deliver({ title, body, href }) {
  // This device gets the same alerts from the server; don't double up.
  if (pushActive()) return;
  toast({ title, body, href, ms: 8000 });
  // System notification only when the app isn't on screen (banner covers the rest).
  if (document.visibilityState === 'visible') return;
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, tag: href, icon: './icon-192.png' });
      n.onclick = () => {
        window.focus();
        if (href) location.hash = href;
        n.close();
      };
    }
  } catch {
    /* some mobile browsers only allow notifications from a service worker */
  }
}

const matchup = (g) => `${g.away.abbr} at ${g.home.abbr}`;
const scoreLine = (g) => `${g.away.abbr} ${g.away.score} – ${g.home.score} ${g.home.abbr}`;

/**
 * Decide which alerts a game should raise now. Exported for testing.
 * wanted: this game matches "which games" (all games, or a followed team).
 * prefs: { start, half, final, close } moments switched on.
 */
export function alertsFor(g, { prevState, wanted, prefs, spoilerFree, firstLook }) {
  const out = [];
  const key = `${g.league}:${g.id}`;
  const href = `/${g.league}/game/${g.id}`;
  const state = g.status.state;
  if (wanted) {
    // Starts/finals that happened before we were watching are skipped (no flood on open).
    if (prefs.start && state === 'in' && prevState === 'pre')
      out.push({ id: `${key}:start`, title: `${g.league === 'nfl' ? 'Kickoff' : 'Tip-off'}: ${matchup(g)}`, body: g.broadcast ? `Starting now on ${g.broadcast}` : 'Starting now', href });
    if (prefs.half && g.status.half && prevState !== undefined)
      out.push({ id: `${key}:half`, title: `Halftime: ${matchup(g)}`, body: spoilerFree ? 'Tap to see the score' : scoreLine(g), href });
    if (prefs.final && state === 'post' && prevState === 'in')
      out.push({ id: `${key}:final`, title: `Final: ${matchup(g)}`, body: spoilerFree ? 'Tap to see how it ended' : scoreLine(g), href });
  }
  if (prefs.close && state === 'in') {
    const heat = gameHeat(g);
    if (heat?.hot)
      out.push({
        id: `${key}:close`,
        title: `🔥 ${heat.label}: ${matchup(g)}`,
        body: spoilerFree ? `${g.status.label} · worth tuning in` : `${scoreLine(g)} · ${g.status.label}`,
        href,
      });
  }
  if (firstLook) return out.filter((a) => a.id.endsWith(':close')); // only still-relevant alerts on first look
  return out;
}

export function useGameAlerts() {
  const prefs = useAlertPrefs();
  const { favs } = useFavorites();
  const prev = useRef({});
  const key = JSON.stringify([prefs, favs]);

  useEffect(() => {
    const leagues = new Set();
    const teamMoments = prefs.start || prefs.half || prefs.final;
    if (prefs.close || (teamMoments && prefs.scope === 'all')) {
      leagues.add('nba');
      leagues.add('nfl');
    } else if (teamMoments) for (const f of favs) leagues.add(f.split(':')[0]);
    if (!leagues.size) return;

    let alive = true;
    let timer;
    const isFav = (g) => favs.includes(`${g.league}:${g.home.id}`) || favs.includes(`${g.league}:${g.away.id}`);

    const check = async () => {
      const games = [];
      try {
        if (leagues.has('nba')) {
          const now = new Date();
          games.push(...(await getNbaScoreboard(toKey(now), { fresh: true })));
          // Late games can run past midnight; keep watching yesterday until 5am.
          if (now.getHours() < 5) {
            const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            games.push(...(await getNbaScoreboard(toKey(y), { fresh: true })));
          }
        }
        if (leagues.has('nfl')) games.push(...(await getNflScoreboard(null, { fresh: true })).games);
      } catch {
        /* network hiccup: try again next round */
      }
      if (!alive) return;

      const sent = loadSent();
      const spoilerFree = getSetting('spoilerFree');
      let anyLive = false;
      for (const g of games) {
        const key = `${g.league}:${g.id}`;
        const prevState = prev.current[key];
        const wanted = prefs.scope === 'all' || isFav(g);
        if (g.status.state === 'in' && (wanted || prefs.close)) anyLive = true;
        for (const a of alertsFor(g, { prevState, wanted, prefs, spoilerFree, firstLook: prevState === undefined })) {
          if (sent[a.id]) continue;
          sent[a.id] = Date.now();
          deliver(a);
        }
        prev.current[key] = g.status.state;
      }
      saveSent(sent);
      timer = setTimeout(check, anyLive ? LIVE_POLL : IDLE_POLL);
    };

    check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
