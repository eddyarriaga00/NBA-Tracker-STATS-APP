// Profiles, friends and private messages (Supabase: supabase/social.sql).
import { useCallback, useEffect, useState } from 'react';
import { commentsEnabled, ensureUser, getClient } from './supabase';

export const socialEnabled = commentsEnabled;

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; }
};
const nickname = () => {
  try { return localStorage.getItem('nickname') || ''; } catch { return ''; }
};
const hasSession = () => {
  try { return Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)); } catch { return false; }
};
const changed = (what) => window.dispatchEvent(new CustomEvent('social', { detail: what }));
const fail = (error) => {
  if (error) throw new Error(error.message || 'Something went wrong. Try again.');
};

// ---------- profiles ----------

let mine = null; // this device's profile, once known

/** User ids are UUIDs; anything else in a link can't be a person. */
export const isUserId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ''));

export async function getProfile(id) {
  if (!isUserId(id)) return null;
  const sb = await getClient();
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', id).maybeSingle();
  fail(error);
  return data;
}

async function profilesFor(ids) {
  if (!ids.length) return {};
  const sb = await getClient();
  const { data, error } = await sb.from('profiles').select('*').in('user_id', ids);
  fail(error);
  return Object.fromEntries((data ?? []).map((p) => [p.user_id, p]));
}

export async function saveProfile({ display, username, bio, avatar, teams } = {}) {
  await ensureUser();
  const sb = await getClient();
  const { data, error } = await sb.rpc('save_profile', {
    p_display: display ?? null, p_username: username ?? null, p_bio: bio ?? null, p_avatar: avatar ?? null, p_teams: teams ?? null,
  });
  fail(error);
  mine = data;
  changed('profile');
  return data;
}

/**
 * Makes sure this device has a profile (once it has a nickname), and keeps its
 * name and followed teams up to date. Returns null if there's no nickname yet.
 */
export async function ensureProfile() {
  if (!socialEnabled) return null;
  const name = nickname();
  const user = await ensureUser();
  const current = mine?.user_id === user.id ? mine : await getProfile(user.id);
  const teams = read('favoriteTeams', []).slice(0, 60);
  if (!current) {
    if (!name) return null;
    const google = user.user_metadata?.avatar_url || user.identities?.map((i) => i.identity_data?.avatar_url || i.identity_data?.picture).find(Boolean);
    return saveProfile({ display: name, teams, avatar: /^https:\/\//.test(google ?? '') ? google : undefined });
  }
  mine = current;
  const sameTeams = JSON.stringify(current.teams ?? []) === JSON.stringify(teams);
  if ((name && name !== current.display_name) || !sameTeams) return saveProfile({ display: name || undefined, teams });
  return current;
}

/** Keeps the profile in step with nickname and followed-team changes. */
export function startProfile() {
  if (!socialEnabled) return;
  const run = () => hasSession() && ensureProfile().catch(() => {});
  let t;
  const soon = () => { clearTimeout(t); t = setTimeout(run, 1500); };
  setTimeout(run, 4000); // after the first paint; never slows down launch
  for (const e of ['nickname', 'favorites', 'signed-in']) window.addEventListener(e, soon);
}

/** Your own profile, live. `undefined` while loading, `null` if you don't have one yet. */
export function useMyProfile() {
  const [p, setP] = useState(mine ?? undefined);
  useEffect(() => {
    let alive = true;
    const load = () => ensureProfile().then((x) => alive && setP(x)).catch(() => alive && setP(null));
    load();
    const on = (e) => (e.detail === 'profile' ? setP(mine) : null);
    window.addEventListener('social', on);
    window.addEventListener('nickname', load);
    return () => { alive = false; window.removeEventListener('social', on); window.removeEventListener('nickname', load); };
  }, []);
  return p;
}

export async function searchProfiles(q) {
  const sb = await getClient();
  const { data, error } = await sb.rpc('search_profiles', { p_q: q });
  fail(error);
  return data ?? [];
}

/** Shrinks a photo to a 320px square and saves it as your profile picture. */
export async function uploadAvatar(file) {
  if (!/^image\//.test(file.type)) throw new Error('Choose a photo.');
  const user = await ensureUser();
  const img = await createImageBitmap(file).catch(() => { throw new Error('That photo couldn’t be read. Try another.'); });
  const size = 320;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const side = Math.min(img.width, img.height);
  canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('That photo couldn’t be read. Try another.');
  const sb = await getClient();
  const path = `${user.id}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  fail(error);
  const old = mine?.avatar_url?.split('/avatars/')[1];
  const saved = await saveProfile({ avatar: sb.storage.from('avatars').getPublicUrl(path).data.publicUrl });
  if (old?.startsWith(`${user.id}/`)) sb.storage.from('avatars').remove([old]).catch(() => {});
  return saved;
}

// ---------- friends ----------

/** { me, friends, incoming, outgoing } with each person's profile. */
export async function loadFriends() {
  const user = await ensureUser();
  const sb = await getClient();
  const { data, error } = await sb.from('friendships').select('*');
  fail(error);
  const rows = data ?? [];
  const other = (r) => (r.requester === user.id ? r.addressee : r.requester);
  const people = await profilesFor([...new Set(rows.map(other))]);
  const list = (pick) => rows.filter(pick).map((r) => people[other(r)]).filter(Boolean).sort((a, b) => a.display_name.localeCompare(b.display_name));
  return {
    me: user.id,
    friends: list((r) => r.status === 'accepted'),
    incoming: list((r) => r.status === 'pending' && r.addressee === user.id),
    outgoing: list((r) => r.status === 'pending' && r.requester === user.id),
  };
}

/** How you and this person stand: 'none' | 'friends' | 'incoming' | 'outgoing'. */
export async function friendStatus(id) {
  const user = await ensureUser();
  const sb = await getClient();
  const { data } = await sb.from('friendships').select('*').or(`and(requester.eq.${user.id},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${user.id})`);
  const r = data?.[0];
  if (!r) return 'none';
  if (r.status === 'accepted') return 'friends';
  return r.requester === user.id ? 'outgoing' : 'incoming';
}

const call = async (fn, args) => {
  await ensureUser();
  const sb = await getClient();
  const { data, error } = await sb.rpc(fn, args);
  fail(error);
  changed('friends');
  return data;
};
export const addFriend = async (id) => {
  if (!(await ensureProfile())) throw new Error('Pick a nickname first.');
  return call('add_friend', { p_user: id });
};
export const answerFriend = (id, accept) => call('answer_friend', { p_user: id, p_accept: accept });
export const removeFriend = (id) => call('remove_friend', { p_user: id });

// ---------- private messages ----------

const pair = (a, b) => `and(sender.eq.${a},recipient.eq.${b}),and(sender.eq.${b},recipient.eq.${a})`;

export async function loadMessages(other) {
  const user = await ensureUser();
  const sb = await getClient();
  const { data, error } = await sb.from('dms').select('*').or(pair(user.id, other)).order('created_at', { ascending: false }).limit(200);
  fail(error);
  return { me: user.id, messages: (data ?? []).reverse() };
}

export async function sendMessage(other, body) {
  const sb = await getClient();
  const { data, error } = await sb.from('dms').insert({ recipient: other, body }).select().single();
  if (error) throw new Error(/row-level security/i.test(error.message) ? 'You can only message friends.' : error.message);
  return data;
}

export async function deleteMessage(id) {
  const sb = await getClient();
  fail((await sb.from('dms').delete().eq('id', id)).error);
}

export async function markRead(other) {
  const sb = await getClient();
  await sb.rpc('mark_dms_read', { p_user: other });
  changed('read');
}

/** Latest message and unread count for each person you've talked to. */
export async function loadInbox() {
  const user = await ensureUser();
  const sb = await getClient();
  const { data, error } = await sb.from('dms').select('*').order('created_at', { ascending: false }).limit(400);
  fail(error);
  const out = {};
  for (const m of data ?? []) {
    const other = m.sender === user.id ? m.recipient : m.sender;
    out[other] ??= { last: m, unread: 0 };
    if (m.recipient === user.id && !m.read_at) out[other].unread++;
  }
  return out;
}

/** Calls `on` whenever a message or friendship of yours changes. Returns an unsubscribe. */
export async function watchSocial(on) {
  const sb = await getClient();
  const ch = sb
    .channel(`social:${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dms' }, (e) => on('dm', e))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (e) => on('friends', e))
    .subscribe();
  return () => sb.removeChannel(ch);
}

/** Unread messages + friend requests waiting, for the Friends tab badge. */
export function useSocialBadge() {
  const [n, setN] = useState(0);
  const load = useCallback(async () => {
    if (!socialEnabled || !hasSession()) return;
    const sb = await getClient();
    const { data } = await sb.auth.getSession();
    const me = data.session?.user?.id;
    if (!me) return;
    const [dm, fr] = await Promise.all([
      sb.from('dms').select('id', { count: 'exact', head: true }).eq('recipient', me).is('read_at', null),
      sb.from('friendships').select('requester', { count: 'exact', head: true }).eq('addressee', me).eq('status', 'pending'),
    ]);
    setN((dm.count ?? 0) + (fr.count ?? 0));
  }, []);
  useEffect(() => {
    if (!socialEnabled || !hasSession()) return;
    let stop;
    let alive = true;
    const run = () => load().catch(() => {});
    // After launch, so the chat library never delays the first screen.
    const t = setTimeout(() => {
      run();
      watchSocial(run).then((s) => (alive ? (stop = s) : s())).catch(() => {});
    }, 3000);
    const vis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('social', run);
    return () => {
      alive = false;
      clearTimeout(t);
      stop?.();
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('social', run);
    };
  }, [load]);
  return n;
}
