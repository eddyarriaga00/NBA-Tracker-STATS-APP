-- NBA Tracker: profiles, friends and private messages.
-- Run once in Supabase SQL Editor (after schema.sql and pickem.sql). Safe to re-run.

-- ---------- profiles ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) < 500)),
  teams text[] not null default '{}' check (cardinality(teams) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (username);

-- Everyone can see profiles; they are only written through save_profile().
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- A free username based on a name: "Eddy A." -> "eddya", or "eddya4821" if taken.
create or replace function public.free_username(p_base text) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := left(lower(regexp_replace(coalesce(p_base, ''), '[^a-zA-Z0-9_]', '', 'g')), 14);
  pick text;
begin
  if char_length(base) < 3 then base := base || 'fan'; end if;
  pick := base;
  while exists (select 1 from public.profiles where username = pick) loop
    pick := base || (floor(random() * 9000) + 1000)::int::text;
  end loop;
  return pick;
end $$;
revoke all on function public.free_username(text) from public, anon, authenticated;

-- Create or change your profile. Leave a value null to keep what's there.
create or replace function public.save_profile(
  p_display text default null, p_username text default null, p_bio text default null,
  p_avatar text default null, p_teams text[] default null
) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  uname text := nullif(lower(btrim(coalesce(p_username, ''))), '');
  row public.profiles;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if uname is not null and uname !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Usernames are 3-20 letters, numbers or underscores.';
  end if;
  if uname is not null and exists (select 1 from public.profiles where username = uname and user_id <> me) then
    raise exception 'That username is taken.';
  end if;
  select * into row from public.profiles where user_id = me;
  if not found then
    if nullif(btrim(coalesce(p_display, '')), '') is null then raise exception 'Pick a name first.'; end if;
    insert into public.profiles (user_id, username, display_name, bio, avatar_url, teams)
    values (me, coalesce(uname, public.free_username(p_display)), btrim(p_display), coalesce(btrim(p_bio), ''),
            nullif(p_avatar, ''), coalesce(p_teams, '{}'))
    returning * into row;
  else
    update public.profiles set
      display_name = coalesce(nullif(btrim(coalesce(p_display, '')), ''), display_name),
      username = coalesce(uname, username),
      bio = coalesce(btrim(p_bio), bio),
      avatar_url = case when p_avatar is null then avatar_url else nullif(p_avatar, '') end,
      teams = coalesce(p_teams, teams),
      updated_at = now()
    where user_id = me returning * into row;
  end if;
  return row;
end $$;
revoke all on function public.save_profile(text, text, text, text, text[]) from public, anon;
grant execute on function public.save_profile(text, text, text, text, text[]) to authenticated;

-- Find people by name or username.
create or replace function public.search_profiles(p_q text) returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles
  where char_length(btrim(p_q)) >= 2
    and (username ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%'
      or display_name ilike '%' || replace(replace(btrim(p_q), '%', ''), '_', '\_') || '%')
  order by (username = lower(btrim(p_q))) desc, display_name
  limit 25;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- Give everyone who has already chatted or picked a profile.
do $$
declare r record;
begin
  for r in
    select distinct on (user_id) user_id, name from (
      select user_id, author as name, created_at from public.comments
      union all
      select user_id, nickname, updated_at from public.picks
    ) x where btrim(name) <> '' order by user_id, created_at desc
  loop
    insert into public.profiles (user_id, username, display_name)
    values (r.user_id, public.free_username(r.name), left(btrim(r.name), 24))
    on conflict (user_id) do nothing;
  end loop;
end $$;

-- ---------- friends ----------
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- You only see requests and friendships you're part of; changes go through the functions below.
alter table public.friendships enable row level security;
drop policy if exists "see your friendships" on public.friendships;
create policy "see your friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee));
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- Send a request. If they already asked you, this accepts theirs.
create or replace function public.add_friend(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); st text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_user = me then raise exception 'That''s you.'; end if;
  if not exists (select 1 from public.profiles where user_id = me) then raise exception 'Set up your profile first.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user) then raise exception 'That person isn''t here anymore.'; end if;
  select status into st from public.friendships where requester = me and addressee = p_user;
  if found then return st; end if;
  update public.friendships set status = 'accepted', accepted_at = now()
    where requester = p_user and addressee = me returning status into st;
  if found then return st; end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 50 then
    raise exception 'You have a lot of requests waiting. Try again later.';
  end if;
  insert into public.friendships (requester, addressee) values (me, p_user);
  return 'pending';
end $$;

-- Accept or decline a request someone sent you.
create or replace function public.answer_friend(p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
      where requester = p_user and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where requester = p_user and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

-- Unfriend, or cancel a request you sent.
create or replace function public.remove_friend(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.friendships
  where (requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid());
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon;
revoke all on function public.add_friend(uuid) from public, anon;
revoke all on function public.answer_friend(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.add_friend(uuid) to authenticated;
grant execute on function public.answer_friend(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;

-- ---------- private messages ----------
create table if not exists public.dms (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists dms_pair_idx on public.dms (sender, recipient, created_at desc);
create index if not exists dms_inbox_idx on public.dms (recipient, created_at desc);

-- Only the two people in a conversation can read it, and only friends can message.
alter table public.dms enable row level security;
drop policy if exists "read your messages" on public.dms;
create policy "read your messages" on public.dms for select to authenticated
  using (auth.uid() in (sender, recipient));
drop policy if exists "message a friend" on public.dms;
create policy "message a friend" on public.dms for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(sender, recipient));
drop policy if exists "delete your message" on public.dms;
create policy "delete your message" on public.dms for delete to authenticated using (sender = auth.uid());
revoke all on public.dms from anon, authenticated;
grant select, delete on public.dms to authenticated;
grant insert (recipient, body) on public.dms to authenticated;

create or replace function public.dms_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.dms where sender = new.sender and created_at > now() - interval '30 seconds') >= 20 then
    raise exception 'Slow down! Try again in a few seconds.';
  end if;
  new.created_at := now();
  new.read_at := null;
  new.body := btrim(new.body);
  return new;
end $$;
drop trigger if exists dms_before_insert on public.dms;
create trigger dms_before_insert before insert on public.dms
  for each row execute function public.dms_before_insert();

-- Mark everything a friend sent you as read.
create or replace function public.mark_dms_read(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.dms set read_at = now() where recipient = auth.uid() and sender = p_user and read_at is null;
$$;
revoke all on function public.mark_dms_read(uuid) from public, anon;
grant execute on function public.mark_dms_read(uuid) to authenticated;

-- Live updates.
alter table public.dms replica identity full;
alter table public.friendships replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.dms; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end;
end $$;

-- ---------- profile photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 400000, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
-- Each person can only write inside their own folder (avatars/<their id>/…).
drop policy if exists "upload your avatar" on storage.objects;
create policy "upload your avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "remove your avatar" on storage.objects;
create policy "remove your avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
