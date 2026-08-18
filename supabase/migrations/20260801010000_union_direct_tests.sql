create table if not exists public.union_direct_test_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  phone text not null,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  external_username text,
  package text,
  dns text,
  expires_at timestamptz,
  payment_url text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists union_direct_test_events_user_created_idx
  on public.union_direct_test_events(user_id, created_at desc);

alter table public.union_direct_test_events enable row level security;

drop policy if exists "Users read own direct Union tests" on public.union_direct_test_events;
create policy "Users read own direct Union tests"
  on public.union_direct_test_events for select
  using (auth.uid() = user_id);

revoke all on public.union_direct_test_events from anon;
grant select on public.union_direct_test_events to authenticated;
