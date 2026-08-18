alter table public.union_direct_test_events
  add column if not exists assisted boolean not null default false,
  add column if not exists requested_by_phone text,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists union_direct_test_events_requested_by_idx
  on public.union_direct_test_events(user_id, requested_by_phone, created_at desc)
  where assisted = true;

comment on column public.union_direct_test_events.requested_by_phone is
  'Phone of the authenticated requester when an attendant creates a test for a different beneficiary phone.';
