create table if not exists public.assisted_test_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null,
  session_key text not null,
  requester_phone text not null,
  beneficiary_name text not null,
  beneficiary_phone text not null,
  server text not null default 'kyros' check (server in ('kyros','vornak','kronos','zeus','fenix','p2p')),
  duration_hours integer not null default 6 check (duration_hours in (6,12)),
  content text not null default 'no_adults' check (content in ('complete','no_adults')),
  status text not null default 'pending' check (status in ('pending','completed','rejected')),
  test_event_id uuid references public.union_direct_test_events(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_key)
);

create index if not exists assisted_test_requests_queue_idx
  on public.assisted_test_requests(user_id, status, created_at desc);

alter table public.assisted_test_requests enable row level security;

drop policy if exists "Users manage own assisted test requests" on public.assisted_test_requests;
create policy "Users manage own assisted test requests"
  on public.assisted_test_requests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.assisted_test_requests to authenticated;

comment on table public.assisted_test_requests is
  'Pending requests collected by WhatsApp for a test benefiting another phone. External creation requires authenticated operator confirmation.';
