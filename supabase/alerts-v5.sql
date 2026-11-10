-- NBA Tracker alerts v5: start alerts go out at the scheduled time (not when
-- ESPN notices the tip a minute late), and every alert sent is logged so
-- timing can be checked afterwards.
alter table public.alert_game_state add column if not exists start_sent boolean not null default false;
-- Games already under way or finished have had their start alert.
update public.alert_game_state set start_sent = true where state <> 'pre';

create table if not exists public.alert_log (
  id bigint generated always as identity primary key,
  sent_at timestamptz not null default now(),
  game_key text not null,
  kind text not null,
  title text not null,
  devices int not null default 0
);
-- No policies: only the server job reads or writes this.
alter table public.alert_log enable row level security;
create index if not exists alert_log_sent_at on public.alert_log (sent_at desc);
