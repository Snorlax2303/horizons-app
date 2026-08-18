create table if not exists public.botbot_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  phone text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'ignored', 'processed', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, event_key)
);

create index if not exists botbot_webhook_events_user_created_idx
  on public.botbot_webhook_events(user_id, created_at desc);

alter table public.botbot_webhook_events enable row level security;

drop policy if exists "Users read own BotBot events" on public.botbot_webhook_events;
create policy "Users read own BotBot events"
  on public.botbot_webhook_events for select
  using (auth.uid() = user_id);

revoke all on public.botbot_webhook_events from anon;
grant select on public.botbot_webhook_events to authenticated;
