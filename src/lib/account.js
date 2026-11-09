// Accounts. Everyone starts as a guest (an anonymous Supabase account), so
// chat, picks and alerts work right away. Signing up with Google or email
// upgrades that same account, so your nickname, picks and comments carry over.
// Signing in on another device switches to your existing account.
import { useEffect, useState } from 'react';
import { commentsEnabled, getClient } from './supabase';

const RETURN_KEY = 'authReturnTo';
const NICK_KEY = 'nickname';

export const accountsEnabled = commentsEnabled;

const base = () => `${location.origin}${location.pathname}`;

/** Open the sign-in sheet from anywhere. */
export const openAccount = () => window.dispatchEvent(new Event('open-account'));

function describe(user) {
  if (!user) return null;
  const google = user.identities?.some((i) => i.provider === 'google') || user.app_metadata?.provider === 'google';
  return {
    id: user.id,
    guest: !!user.is_anonymous,
    email: user.email || '',
    provider: google ? 'Google' : user.email ? 'Email' : 'Guest',
    nickname: user.user_metadata?.nickname || user.user_metadata?.full_name?.split(' ')[0] || '',
    // A guest who links Google keeps their old profile, so the photo lives on the Google identity.
    avatar:
      user.user_metadata?.avatar_url ||
      user.identities?.map((i) => i.identity_data?.avatar_url || i.identity_data?.picture).find(Boolean) ||
      '',
  };
}

// Your nickname follows your account to other devices.
function adoptNickname(acct) {
  if (!acct || acct.guest || !acct.nickname) return;
  try {
    if (localStorage.getItem(NICK_KEY) !== acct.nickname) {
      localStorage.setItem(NICK_KEY, acct.nickname);
      window.dispatchEvent(new Event('nickname'));
    }
  } catch {
    /* ignore */
  }
}

/** Save a nickname change to the account (signed-in users only). */
export async function saveNickname(name) {
  if (!accountsEnabled) return;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  if (u && !u.is_anonymous && u.user_metadata?.nickname !== name) await sb.auth.updateUser({ data: { nickname: name } });
}

/** Current account, live. `null` while loading; `{ guest: true }`-style object after. */
export function useAccount(enabled = true) {
  const [acct, setAcct] = useState(null);
  useEffect(() => {
    if (!accountsEnabled || !enabled) return;
    let sub;
    let alive = true;
    getClient().then(async (sb) => {
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      const a = describe(data.session?.user) ?? { guest: true, none: true };
      setAcct(a);
      adoptNickname(a);
      sub = sb.auth.onAuthStateChange((_e, session) => {
        const next = describe(session?.user) ?? { guest: true, none: true };
        setAcct(next);
        adoptNickname(next);
      }).data.subscription;
    });
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
  }, [enabled]);
  return acct;
}

/** Is Google sign-in switched on in Supabase? */
export async function googleEnabled() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    return !!(await r.json()).external?.google;
  } catch {
    return false;
  }
}

const rememberWhere = () => {
  try { sessionStorage.setItem(RETURN_KEY, location.hash || '#/'); } catch { /* ignore */ }
};

/** Google: a guest's account is upgraded (keeps history); otherwise a normal sign-in. */
export async function continueWithGoogle() {
  const sb = await getClient();
  rememberWhere();
  const { data } = await sb.auth.getSession();
  const opts = { redirectTo: base(), queryParams: { prompt: 'select_account' } };
  if (data.session?.user?.is_anonymous) {
    const { error } = await sb.auth.linkIdentity({ provider: 'google', options: opts });
    if (!error) return;
  }
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: opts });
  if (error) throw error;
}

const friendly = (e) => {
  const m = e?.message || String(e);
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return 'That email already has an account. Choose “Sign in” instead.';
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/password should be at least/i.test(m)) return 'Use a password with at least 6 characters.';
  if (/unable to validate email|invalid format|email address .* is invalid/i.test(m)) return 'That email address doesn’t look right.';
  return m;
};

/** Create an email account. A guest is upgraded in place, keeping their history. */
export async function createEmailAccount(email, password, nickname) {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  const meta = nickname ? { nickname } : undefined;
  const res = data.session?.user?.is_anonymous
    ? await sb.auth.updateUser({ email, password, data: meta })
    : await sb.auth.signUp({ email, password, options: { data: meta } });
  if (res.error) throw new Error(friendly(res.error));
  window.dispatchEvent(new Event('signed-in'));
}

/** Sign in to an existing email account (this device switches to it). */
export async function signInWithEmail(email, password) {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error));
  window.dispatchEvent(new Event('signed-in'));
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
  try {
    localStorage.removeItem('pushActive');
  } catch {
    /* ignore */
  }
}

/**
 * Coming back from Google: finish signing in, then return to the page you
 * were on. If that Google account already belongs to someone (you signed up
 * on another device), sign in to it instead of upgrading this guest.
 */
export async function handleAuthRedirect() {
  const q = new URLSearchParams(location.search);
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = q.get('code');
  const errCode = q.get('error_code') || h.get('error_code');
  const errText = q.get('error_description') || h.get('error_description');
  if (!code && !errCode) return;
  let back = '#/';
  try { back = sessionStorage.getItem(RETURN_KEY) || '#/'; } catch { /* ignore */ }
  const sb = await getClient();
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code).catch((e) => ({ error: e }));
    if (!error) window.dispatchEvent(new Event('signed-in'));
  }
  history.replaceState(null, '', base() + back);
  if (errCode === 'identity_already_exists' || /already linked|already exists/i.test(errText || '')) {
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: base() } });
    return;
  }
  if (errCode) {
    window.dispatchEvent(new CustomEvent('auth-error', { detail: (errText || errCode).replace(/\+/g, ' ') }));
  }
  window.dispatchEvent(new PopStateEvent('popstate')); // let the router see the restored page
}

/** Permanently deletes your account: picks, comments, reactions and alert signups. */
export async function deleteAccount() {
  const sb = await getClient();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await sb.auth.signOut({ scope: 'local' });
  for (const k of ['pushActive', 'prefsSyncedUser']) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

/** Your Pick'em record and comment count, for the profile card. */
export async function getProfileStats(userId) {
  const sb = await getClient();
  const [picks, comments] = await Promise.all([
    sb.from('picks').select('league,result').eq('user_id', userId),
    sb.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  const rows = picks.data ?? [];
  const w = rows.filter((r) => r.result === 'win').length;
  const l = rows.filter((r) => r.result === 'loss').length;
  return { picks: rows.length, w, l, pending: rows.filter((r) => !r.result).length, comments: comments.count ?? 0 };
}

/** Sends a test alert to this account's devices (server checks who you are). */
export async function sendTestAlert() {
  const sb = await getClient();
  const { data, error } = await sb.functions.invoke('test-alert', { body: {} });
  if (error) throw new Error('Couldn’t send a test alert.');
  return data;
}
