-- NBA Tracker alerts v3: big performances (any player, any game).
alter table public.push_subscriptions add column if not exists big boolean not null default false;
-- Which big moments were already sent per game (null = not looked at yet).
alter table public.alert_game_state add column if not exists big_sent text[];

drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean);
drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean);
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_followed text[], p_close boolean, p_spoiler boolean,
  p_scope text default 'teams', p_starts boolean default true, p_halftime boolean default true, p_finals boolean default true,
  p_big boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, followed, close_games, spoiler_free, scope, starts, halftime, finals, big, updated_at)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), coalesce(p_followed, '{}'), coalesce(p_close, false), coalesce(p_spoiler, false),
          case when p_scope = 'all' then 'all' else 'teams' end, coalesce(p_starts, true), coalesce(p_halftime, true), coalesce(p_finals, true),
          coalesce(p_big, false), now())
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    followed = excluded.followed, close_games = excluded.close_games, spoiler_free = excluded.spoiler_free,
    scope = excluded.scope, starts = excluded.starts, halftime = excluded.halftime, finals = excluded.finals,
    big = excluded.big, updated_at = now();
end $$;
revoke all on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean) to authenticated;
