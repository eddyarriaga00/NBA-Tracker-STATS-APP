-- NBA Tracker: alerts that arrive when the app is closed (web push).
-- Run once in Supabase SQL Editor after schema.sql. The cron job at the bottom
-- needs your CRON_SECRET; the setup step fills it in for you.

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) < 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  user_id uuid references auth.users (id) on delete cascade,
  followed text[] not null default '{}' check (cardinality(followed) <= 60),
  close_games boolean not null default false,
  spoiler_free boolean not null default false,
  updated_at timestamptz not null default now()
);
-- No policies: devices can't read or write this table directly. Only the two
-- functions below (for a device's own subscription) and the server job touch it.
alter table public.push_subscriptions enable row level security;

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_followed text[], p_close boolean, p_spoiler boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, followed, close_games, spoiler_free, updated_at)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), coalesce(p_followed, '{}'), coalesce(p_close, false), coalesce(p_spoiler, false), now())
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    followed = excluded.followed, close_games = excluded.close_games,
    spoiler_free = excluded.spoiler_free, updated_at = now();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.save_push_subscription(text, text, text, text[], boolean, boolean) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[], boolean, boolean) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- What the server job last saw for each game (so each alert goes out once).
create table if not exists public.alert_game_state (
  game_key text primary key,
  state text not null,
  close_sent boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.alert_game_state enable row level security;

-- Run the alert job every minute.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('send-game-alerts') where exists (select 1 from cron.job where jobname = 'send-game-alerts');
select cron.schedule(
  'send-game-alerts',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);
