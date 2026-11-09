#!/usr/bin/env node
// Checks the Supabase setup for comments, step by step, and says exactly what to fix.
// Usage: npm run check:comments
import { readFileSync } from 'node:fs';

const env = {};
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.log('✗ No .env.local yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).');
  process.exit(1);
}

const url = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = env.VITE_SUPABASE_ANON_KEY || '';
const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const dash = ref ? `https://supabase.com/dashboard/project/${ref}` : 'https://supabase.com/dashboard';
const ok = (m) => console.log(`✓ ${m}`);
const fail = (m, fix) => {
  console.log(`✗ ${m}`);
  if (fix) console.log(`  → ${fix}`);
  process.exit(1);
};

if (!ref) fail('VITE_SUPABASE_URL should look like https://abcdefgh.supabase.co', `${dash} → Project Settings → API`);
if (!key.startsWith('eyJ') && !key.startsWith('sb_publishable_')) fail('VITE_SUPABASE_ANON_KEY looks wrong (use the anon / publishable key, never the service_role / secret key)', `${dash}/settings/api-keys`);

const h = { apikey: key, 'Content-Type': 'application/json' };
// Legacy anon keys are JWTs and also go in Authorization; new publishable keys don't.
const anon = key.startsWith('eyJ') ? { ...h, Authorization: `Bearer ${key}` } : h;

// 1. Project reachable with this key
let r = await fetch(`${url}/rest/v1/comments?select=id&limit=1`, { headers: anon }).catch((e) => fail(`Can't reach ${url}: ${e.message}`));
if (r.status === 401) fail('Supabase rejected the key', `Copy the anon/publishable key again: ${dash}/settings/api-keys`);
ok('Project found and key accepted');

// 2. Tables exist
if (r.status === 404 || r.status === 400) {
  const body = await r.text();
  if (/comments|PGRST205|42P01|relation/i.test(body)) fail('The comments tables are not set up yet', `Open ${dash}/sql/new, paste supabase/schema.sql, and click Run`);
}
if (!r.ok) fail(`Unexpected response reading comments (${r.status}): ${(await r.text()).slice(0, 200)}`);
ok('Comments tables exist and are readable');

// 3. Anonymous sign-in enabled
r = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers: h, body: JSON.stringify({ data: {} }) });
const auth = await r.json().catch(() => ({}));
if (!r.ok || !auth.access_token) {
  const msg = auth.msg || auth.error_description || auth.message || JSON.stringify(auth).slice(0, 200);
  if (/anonymous/i.test(msg)) fail('Anonymous sign-ins are turned off', `Turn on "Allow anonymous sign-ins": ${dash}/auth/providers`);
  fail(`Sign-in test failed: ${msg}`);
}
ok('Anonymous sign-ins work (people can post with just a nickname)');
const user = { ...h, Authorization: `Bearer ${auth.access_token}` };

// 4. Post, react, and delete a test comment
r = await fetch(`${url}/rest/v1/comments`, {
  method: 'POST',
  headers: { ...user, Prefer: 'return=representation' },
  body: JSON.stringify({ room: 'setup-check', author: 'Setup check', body: 'Testing comments ✔' }),
});
const rows = await r.json().catch(() => null);
if (!r.ok || !rows?.[0]?.id) fail(`Posting a test comment failed: ${JSON.stringify(rows).slice(0, 200)}`, `Re-run supabase/schema.sql in ${dash}/sql/new`);
const id = rows[0].id;
ok('Posting a comment works');

r = await fetch(`${url}/rest/v1/comment_reactions`, { method: 'POST', headers: user, body: JSON.stringify({ comment_id: id, room: 'setup-check', emoji: '🔥' }) });
if (!r.ok) fail(`Reacting failed: ${(await r.text()).slice(0, 200)}`);
ok('Emoji reactions work');

r = await fetch(`${url}/rest/v1/comments?id=eq.${id}`, { method: 'DELETE', headers: { ...user, Prefer: 'return=representation' } });
const del = await r.json().catch(() => []);
if (!r.ok || !del.length) fail('Deleting your own comment failed', `Re-run supabase/schema.sql in ${dash}/sql/new`);
ok('Deleting your own comment works (test comment cleaned up)');

// 5. Strangers can't delete other people's comments
r = await fetch(`${url}/rest/v1/comments?room=eq.setup-check`, { method: 'DELETE', headers: { ...anon, Prefer: 'return=representation' } });
const strangers = await r.json().catch(() => []);
if (Array.isArray(strangers) && strangers.length) fail('Security problem: anyone can delete comments', `Re-run supabase/schema.sql in ${dash}/sql/new`);
ok('Security rules are on (no one can delete other people’s comments)');

console.log('\nAll set! Comments are ready. Run: npm run deploy');
