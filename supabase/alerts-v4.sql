-- NBA Tracker alerts v4: each moment picks its own games ('off' | 'teams' | 'all').
-- Older app versions keep sending scope + on/off, which still works.
alter table public.push_subscriptions add column if not exists start_for text check (start_for in ('off', 'teams', 'all'));
alter table public.push_subscriptions add column if not exists half_for text check (half_for in ('off', 'teams', 'all'));
alter table public.push_subscriptions add column if not exists final_for text check (final_for in ('off', 'teams', 'all'));

drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean);
drop function if exists public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean, text, text, text);
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_followed text[], p_close boolean, p_spoiler boolean,
  p_scope text default 'teams', p_starts boolean default true, p_halftime boolean default true, p_finals boolean default true,
  p_big boolean default false, p_start_for text default null, p_half_for text default null, p_final_for text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  sc text := case when p_scope = 'all' then 'all' else 'teams' end;
  v_start text := case when p_start_for in ('off', 'teams', 'all') then p_start_for when coalesce(p_starts, true) then sc else 'off' end;
  v_half text := case when p_half_for in ('off', 'teams', 'all') then p_half_for when coalesce(p_halftime, true) then sc else 'off' end;
  v_final text := case when p_final_for in ('off', 'teams', 'all') then p_final_for when coalesce(p_finals, true) then sc else 'off' end;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, user_id, followed, close_games, spoiler_free, scope, starts, halftime, finals, big, start_for, half_for, final_for, updated_at)
  values (p_endpoint, p_p256dh, p_auth, auth.uid(), coalesce(p_followed, '{}'), coalesce(p_close, false), coalesce(p_spoiler, false),
          sc, v_start <> 'off', v_half <> 'off', v_final <> 'off', coalesce(p_big, false), v_start, v_half, v_final, now())
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id,
    followed = excluded.followed, close_games = excluded.close_games, spoiler_free = excluded.spoiler_free,
    scope = excluded.scope, starts = excluded.starts, halftime = excluded.halftime, finals = excluded.finals,
    big = excluded.big, start_for = excluded.start_for, half_for = excluded.half_for, final_for = excluded.final_for,
    updated_at = now();
end $$;
revoke all on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text[], boolean, boolean, text, boolean, boolean, boolean, boolean, text, text, text) to authenticated;

-- Fill the new columns for devices saved before this change.
update public.push_subscriptions set
  start_for = coalesce(start_for, case when starts then scope else 'off' end),
  half_for = coalesce(half_for, case when halftime then scope else 'off' end),
  final_for = coalesce(final_for, case when finals then scope else 'off' end);
