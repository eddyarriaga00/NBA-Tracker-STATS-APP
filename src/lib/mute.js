import { useEffect, useState } from 'react';

// People you've muted: their chat messages and comments are hidden for you.
// Kept on this device only; they aren't told.
const KEY = 'mutedUsers';

export function mutedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
}

export function setMuted(id, on) {
  const s = mutedIds();
  if (on) s.add(id); else s.delete(id);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('muted'));
}

export function useMuted() {
  const [s, setS] = useState(mutedIds);
  useEffect(() => {
    const on = () => setS(mutedIds());
    window.addEventListener('muted', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('muted', on); window.removeEventListener('storage', on); };
  }, []);
  return s;
}
