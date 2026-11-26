-- NBA Tracker: crash reports. The app sends a short report when something breaks
-- (message, where, which page, browser). Anyone can add one; nobody can read them
-- from the app. Read them with: select * from error_log order by at desc limit 50;
create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 4000),
  page text check (char_length(page) <= 300),
  version text check (char_length(version) <= 40),
  agent text check (char_length(agent) <= 300)
);
alter table public.error_log enable row level security;
drop policy if exists "report a crash" on public.error_log;
create policy "report a crash" on public.error_log for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create index if not exists error_log_at_idx on public.error_log (at desc);

-- Old reports clear themselves after 30 days.
select cron.unschedule('prune-error-log') where exists (select 1 from cron.job where jobname = 'prune-error-log');
select cron.schedule('prune-error-log', '17 4 * * *', $$delete from public.error_log where at < now() - interval '30 days'$$);
