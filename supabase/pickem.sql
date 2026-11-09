-- NBA Tracker: Pick'em league for you and your friends.
-- Everyone picks a winner before each game; the alert server (send-alerts)
-- grades picks from ESPN's final scores and voids any pick made after tip-off.

create table if not exists public.picks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  league text not null check (league in ('nba', 'nfl')),
  game_id text not null check (game_id ~ '^[0-9]{1,16}$'),
  team_id text not null check (team_id ~ '^[0-9]{1,8}$'),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 24),
  game_start timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  result text check (result in ('win', 'loss', 'push', 'void')),
  primary key (user_id, league, game_id)
);
create index if not exists picks_game_idx on public.picks (league, game_id);
create index if not exists picks_start_idx on public.picks (league, game_start desc);
create index if not exists picks_pending_idx on public.picks (game_start) where result is null;

alter table public.picks enable row level security;

-- Your own picks are always visible to you; everyone else's appear once the game starts.
drop policy if exists "see picks" on public.picks;
create policy "see picks" on public.picks for select to anon, authenticated
  using (user_id = auth.uid() or game_start <= now());

-- Pick, change or clear your pick only before the game starts.
drop policy if exists "make your pick" on public.picks;
create policy "make your pick" on public.picks for insert to authenticated
  with check (user_id = auth.uid() and game_start > now());
drop policy if exists "change your pick" on public.picks;
create policy "change your pick" on public.picks for update to authenticated
  using (user_id = auth.uid() and game_start > now())
  with check (user_id = auth.uid() and game_start > now());
drop policy if exists "clear your pick" on public.picks;
create policy "clear your pick" on public.picks for delete to authenticated
  using (user_id = auth.uid() and game_start > now());

-- Devices can only write their pick; results are set by the server.
revoke all on public.picks from anon, authenticated;
grant select on public.picks to anon, authenticated;
grant insert (league, game_id, team_id, nickname, game_start) on public.picks to authenticated;
-- (league and game_id are included because an upsert re-sends them; the key can't change rows you don't own.)
grant update (league, game_id, team_id, nickname, game_start) on public.picks to authenticated;
grant delete on public.picks to authenticated;

-- Server-side timestamps, and a cap so nobody can spam picks.
create or replace function public.picks_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.picks where user_id = new.user_id and created_at > now() - interval '1 minute') >= 60 then
      raise exception 'Slow down! Too many picks in a minute.';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.result := null;
  elsif new.team_id is distinct from old.team_id then
    new.updated_at := now();
  end if;
  new.nickname := btrim(new.nickname);
  return new;
end $$;

drop trigger if exists picks_stamp on public.picks;
create trigger picks_stamp before insert or update on public.picks
  for each row execute function public.picks_stamp();

-- Live updates when friends pick and when games are graded.
alter table public.picks replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.picks; exception when duplicate_object then null; end;
end $$;
