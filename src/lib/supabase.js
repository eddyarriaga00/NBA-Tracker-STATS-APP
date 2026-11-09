import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const commentsEnabled = !!supabase;

let sessionPromise = null;

/** Every device gets an anonymous Supabase account so it can post and delete its own comments. */
export function ensureUser() {
  if (!supabase) return Promise.reject(new Error('Comments are not set up.'));
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return data.session.user;
      const { data: d, error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(error.message.includes('Anonymous') ? 'Anonymous sign-ins are turned off in Supabase.' : error.message);
      return d.user;
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

export async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}
