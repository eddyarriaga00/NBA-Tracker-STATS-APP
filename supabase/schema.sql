-- NBA Tracker: shared comments for game threads and the general chat.
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Also enable: Authentication > Sign In / Providers > "Allow anonymous sign-ins".

create table if not exists public.comments (
  id bigint generated always as identity primary key,
  room text not null check (char_length(room) between 1 and 64),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author text not null check (char_length(btrim(author)) between 1 and 24),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists comments_room_created_idx on public.comments (room, created_at desc);

create table if not exists public.comment_reactions (
  comment_id bigint not null references public.comments (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  room text not null check (char_length(room) between 1 and 64),
  emoji text not null check (emoji in ('🔥', '😂', '💀', '👍', '👎', '🐐')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index if not exists comment_reactions_room_idx on public.comment_reactions (room);

-- Row level security: everyone can read; you can only post, react and delete as yourself.
alter table public.comments enable row level security;
alter table public.comment_reactions enable row level security;

drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments for select to anon, authenticated using (true);
drop policy if exists "post as yourself" on public.comments;
create policy "post as yourself" on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete your own" on public.comments;
create policy "delete your own" on public.comments for delete to authenticated using (user_id = auth.uid());

drop policy if exists "reactions are public" on public.comment_reactions;
create policy "reactions are public" on public.comment_reactions for select to anon, authenticated using (true);
drop policy if exists "react as yourself" on public.comment_reactions;
create policy "react as yourself" on public.comment_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "remove your reaction" on public.comment_reactions;
create policy "remove your reaction" on public.comment_reactions for delete to authenticated using (user_id = auth.uid());

-- Clean input and stop spam: at most 6 comments per person per 30 seconds.
create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments
      where user_id = new.user_id and created_at > now() - interval '30 seconds') >= 6 then
    raise exception 'Slow down! Too many comments. Try again in a few seconds.';
  end if;
  new.created_at := now();
  new.author := btrim(new.author);
  new.body := btrim(new.body);
  return new;
end $$;

drop trigger if exists comments_before_insert on public.comments;
create trigger comments_before_insert before insert on public.comments
  for each row execute function public.comments_before_insert();

-- Live updates.
alter table public.comments replica identity full;
alter table public.comment_reactions replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comment_reactions; exception when duplicate_object then null; end;
end $$;
