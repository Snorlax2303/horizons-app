-- Auditoria das decisões da fila de recuperação.

create table if not exists public.customer_recovery_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  recovery_id uuid not null references public.customer_recovery_queue(id) on delete cascade,
  action text not null check (action in ('status','notes','create')),
  previous_status text,
  new_status text,
  notes text,
  notes_length integer,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_recovery_audit_recovery_idx
  on public.customer_recovery_audit(user_id, recovery_id, created_at desc);

alter table public.customer_recovery_audit enable row level security;

drop policy if exists "customer_recovery_audit_owner" on public.customer_recovery_audit;
create policy "customer_recovery_audit_owner" on public.customer_recovery_audit for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.customer_recovery_audit from anon;
grant select,insert on public.customer_recovery_audit to authenticated;
