-- NBA Tracker alerts v2: choose which games (your teams or all games) and
-- which moments (start, halftime, final, close games). Run after push.sql.

alter table public.push_subscriptions add column if not exists scope text not null default 'teams' check (scope in ('teams', 'all'));
alter table public.push_subscriptions add column if not exists starts boolean not null default true;
alter table public.push_subscriptions add column if not exists halftime boolean not null default true;
alter table public.push_subscriptions add column if not exists finals boolean not null default true;

alter table public.alert_game_state add column if not exists half_sent boolean not null default false;

-- Replace the save function (older app versions still work: new options have defaults).
drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean);
drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean);
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_followed text[], p_close boolean, p_spoiler boolean,
  p_scope text default 'teams', p_starts boolean default true, p_halftime boolean default true, p_finals boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, followed, close_games, spoiler_free, scope, starts, halftime, finals, updated_at)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), coalesce(p_followed, '{}'), coalesce(p_close, false), coalesce(p_spoiler, false),
          case when p_scope = 'all' then 'all' else 'teams' end, coalesce(p_starts, true), coalesce(p_halftime, true), coalesce(p_finals, true), now())
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    followed = excluded.followed, close_games = excluded.close_games, spoiler_free = excluded.spoiler_free,
    scope = excluded.scope, starts = excluded.starts, halftime = excluded.halftime, finals = excluded.finals,
    updated_at = now();
end $$;
revoke all on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean) to authenticated;
