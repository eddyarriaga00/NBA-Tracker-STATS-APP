import { useEffect, useState } from 'react';
import { commentsEnabled, getClient } from './supabase';

// Everyone's profile photo, looked up in batches and remembered for the visit,
// so chat, comments and lists can show real photos instead of initials.
const known = new Map(); // user id -> photo url ('' = none)
let queue = new Set();
let timer = null;

const isId = (id) => /^[0-9a-f-]{36}$/i.test(String(id ?? ''));

function flush() {
  timer = null;
  const ids = [...queue].filter((id) => !known.has(id));
  queue = new Set();
  if (!ids.length || !commentsEnabled) return;
  getClient()
    .then((sb) => sb.from('profiles').select('user_id, avatar_url').in('user_id', ids))
    .then(({ data }) => {
      for (const id of ids) known.set(id, '');
      for (const r of data ?? []) known.set(r.user_id, r.avatar_url || '');
      window.dispatchEvent(new Event('photos'));
    })
    .catch(() => {});
}

/** Someone's photo url, or '' while unknown or when they have none. */
export function usePhoto(id) {
  const [url, setUrl] = useState(() => known.get(id) ?? '');
  useEffect(() => {
    if (!isId(id)) return;
    const on = () => setUrl(known.get(id) ?? '');
    on();
    window.addEventListener('photos', on);
    if (!known.has(id)) {
      queue.add(id);
      timer ??= setTimeout(flush, 30);
    }
    return () => window.removeEventListener('photos', on);
  }, [id]);
  return url;
}

/** After someone changes their own photo. */
export function notePhoto(id, url) {
  if (!isId(id)) return;
  known.set(id, url || '');
  window.dispatchEvent(new Event('photos'));
}
