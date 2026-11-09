// Supabase Edge Function: sends a test alert to the caller's own devices.
// The caller is identified from their sign-in token; nobody can alert others.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const SITE = 'https://eddyarriaga00.github.io/NBA-Tracker-STATS-APP/';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const lastSent = new Map<string, number>(); // simple per-user cooldown

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await db.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return json({ error: 'not signed in' }, 401);

  if (Date.now() - (lastSent.get(user.id) ?? 0) < 15_000) return json({ error: 'wait a few seconds' }, 429);
  lastSent.set(user.id, Date.now());

  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', user.id);
  let sent = 0;
  await Promise.allSettled(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: '🏀 Test alert', body: 'Alerts are working on this device.', url: SITE + '#/settings', tag: 'test' }),
          { TTL: 120, urgency: 'high' }
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    })
  );
  return json({ devices: subs?.length ?? 0, sent });
});
