// The Supabase library is only downloaded once comments are configured and a
// comment section is actually opened, so it never slows down the first load.

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const commentsEnabled = !!(url && key);

let clientPromise = null;
export function getClient() {
  if (!commentsEnabled) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, key, {
      // PKCE keeps Google's return (?code=…) out of the #/route the app uses; account.js finishes it.
      auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce', detectSessionInUrl: false },
    })
  );
  return clientPromise;
}

let sessionPromise = null;

/** Every device gets an anonymous Supabase account so it can post and delete its own comments. */
export function ensureUser() {
  if (!commentsEnabled) return Promise.reject(new Error('Comments are not set up.'));
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const sb = await getClient();
      const { data } = await sb.auth.getSession();
      if (data.session?.user) return data.session.user;
      const { data: d, error } = await sb.auth.signInAnonymously();
      if (error) throw new Error(/anonymous/i.test(error.message) ? 'Anonymous sign-ins are turned off in Supabase.' : error.message);
      return d.user;
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}

export async function currentUserId() {
  const sb = await getClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user?.id ?? null;
}
