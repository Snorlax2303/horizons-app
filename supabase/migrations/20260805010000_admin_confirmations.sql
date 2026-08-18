alter table public.customer_panel_targets
  add column if not exists cinehub_server_id uuid references public.cinehub_servers(id) on delete set null;

create index if not exists customer_panel_targets_cinehub_server_idx
  on public.customer_panel_targets(user_id, cinehub_server_id, active);

create table if not exists public.admin_assistant_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web','whatsapp','api','test')),
  sender_reference text,
  tool_name text not null,
  tool_arguments jsonb not null,
  summary text not null,
  confirmation_code_hash text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','expired','executed','failed')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_assistant_confirmations_pending_idx
  on public.admin_assistant_confirmations(user_id, status, expires_at);

alter table public.admin_assistant_confirmations enable row level security;
drop policy if exists "admin_assistant_confirmations_owner" on public.admin_assistant_confirmations;
create policy "admin_assistant_confirmations_owner" on public.admin_assistant_confirmations for select
  using (auth.uid() = user_id);
revoke all on public.admin_assistant_confirmations from anon, authenticated;
grant select on public.admin_assistant_confirmations to authenticated;

