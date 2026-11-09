import { useEffect, useState } from 'react';

// Favorite teams, stored on this device as ["nba:13", "nfl:9", ...].
const KEY = 'favoriteTeams';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};

export function useFavorites() {
  const [favs, setFavs] = useState(read);
  useEffect(() => {
    const on = () => setFavs(read());
    window.addEventListener('favorites', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('favorites', on); window.removeEventListener('storage', on); };
  }, []);
  const isFav = (lg, id) => favs.includes(`${lg}:${id}`);
  const toggle = (lg, id) => {
    const k = `${lg}:${id}`;
    const next = favs.includes(k) ? favs.filter((x) => x !== k) : [...favs, k];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event('favorites'));
  };
  return { favs, isFav, toggle };
}
