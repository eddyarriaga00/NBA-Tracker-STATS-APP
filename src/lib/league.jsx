import { createContext, useContext } from 'react';
import { LEAGUES } from '../api/espn';

export const LeagueCtx = createContext('nba');
export const useLeague = () => useContext(LeagueCtx);

export function leagueFromPath(pathname) {
  const seg = pathname.split('/')[1];
  if (LEAGUES[seg]) return seg;
  try {
    const saved = localStorage.getItem('league');
    if (LEAGUES[saved]) return saved;
  } catch { /* storage unavailable */ }
  return 'nba';
}

export function rememberLeague(lg) {
  try { localStorage.setItem('league', lg); } catch { /* ignore */ }
}
