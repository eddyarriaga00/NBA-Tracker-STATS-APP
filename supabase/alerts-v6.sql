-- NBA Tracker alerts v6: "Follow live". A device follows one game and gets a
-- single score notification for it that keeps updating in place.
create table if not exists public.live_follows (
  endpoint text not null references public.push_subscriptions (endpoint) on delete cascade,
  game_key text not null check (game_key ~ '^(nba|nfl):[0-9]{1,16}$'),
  every int not null default 20 check (every in (20, 60, 180)), -- least seconds between updates
  sig text,              -- what the last update showed (score + period)
  sent_at timestamptz,   -- when it was sent
  created_at timestamptz not null default now(),
  primary key (endpoint, game_key)
);
-- No policies: devices go through the two functions below; the server job does the rest.
alter table public.live_follows enable row level security;

-- Follow a game (p_every = 20, 60 or 180 seconds) or stop following it (p_every = null).
create or replace function public.set_live_follow(p_endpoint text, p_game text, p_every int default 20) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()) then
    raise exception 'Turn on alerts first.';
  end if;
  if p_every is null then
    delete from public.live_follows where endpoint = p_endpoint and game_key = p_game;
    return;
  end if;
  if (select count(*) from public.live_follows where endpoint = p_endpoint and game_key <> p_game) >= 8 then
    raise exception 'You can follow up to 8 games at once.';
  end if;
  insert into public.live_follows (endpoint, game_key, every) values (p_endpoint, p_game, p_every)
  on conflict (endpoint, game_key) do update set every = excluded.every;
end $$;

-- How often this device gets updates for a game, or null if it isn't following it.
create or replace function public.get_live_follow(p_endpoint text, p_game text) returns int
language sql stable security definer set search_path = public as $$
  select f.every from public.live_follows f
  join public.push_subscriptions s on s.endpoint = f.endpoint
  where f.endpoint = p_endpoint and f.game_key = p_game and s.user_id = auth.uid();
$$;
revoke all on function public.set_live_follow(text, text, int) from public, anon;
revoke all on function public.get_live_follow(text, text) from public, anon;
grant execute on function public.set_live_follow(text, text, int) to authenticated;
grant execute on function public.get_live_follow(text, text) to authenticated;
