create table if not exists public.webhook_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  event_id text,
  status integer not null,
  duration_ms integer not null,
  received_at timestamp with time zone not null default now(),
  metadata jsonb
);

create index if not exists webhook_audit_received_at_idx on public.webhook_audit (received_at desc);
create index if not exists webhook_audit_provider_idx on public.webhook_audit (provider);

alter table public.webhook_audit enable row level security;

drop policy if exists "webhook_audit read owner" on public.webhook_audit;
create policy "webhook_audit read owner" on public.webhook_audit
  for select using (user_id = auth.uid());
