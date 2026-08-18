-- Administrative assistant safety boundary and CineHub server history.

create table if not exists public.cinehub_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code in ('kyros','vornak','kronos','zeus','fenix','p2p')),
  name text not null,
  provider text not null default 'cinehub',
  active boolean not null default true,
  is_default_trial boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, code)
);

create table if not exists public.customer_server_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_panel_target_id uuid references public.customer_panel_targets(id) on delete set null,
  from_server_id uuid references public.cinehub_servers(id) on delete set null,
  to_server_id uuid not null references public.cinehub_servers(id) on delete restrict,
  reason text not null,
  changed_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual' check (source in ('manual','admin_assistant','import')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_assistant_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('web','whatsapp','api','test')),
  sender_reference text,
  request_text text,
  tool_name text,
  tool_arguments jsonb not null default '{}'::jsonb,
  model text,
  fallback_used boolean not null default false,
  status text not null check (status in ('interpreted','completed','clarification','rejected','failed')),
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists customer_server_history_customer_idx
  on public.customer_server_history(user_id, customer_id, created_at desc);
create index if not exists admin_assistant_audit_user_idx
  on public.admin_assistant_audit(user_id, created_at desc);

alter table public.cinehub_servers enable row level security;
alter table public.customer_server_history enable row level security;
alter table public.admin_assistant_audit enable row level security;

drop policy if exists "cinehub_servers_owner" on public.cinehub_servers;
create policy "cinehub_servers_owner" on public.cinehub_servers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customer_server_history_owner" on public.customer_server_history;
create policy "customer_server_history_owner" on public.customer_server_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin_assistant_audit_owner" on public.admin_assistant_audit;
create policy "admin_assistant_audit_owner" on public.admin_assistant_audit for select
  using (auth.uid() = user_id);

revoke all on public.admin_assistant_audit from anon, authenticated;
grant select on public.admin_assistant_audit to authenticated;
grant select,insert,update on public.cinehub_servers to authenticated;
grant select,insert on public.customer_server_history to authenticated;

drop trigger if exists cinehub_servers_updated_at on public.cinehub_servers;
create trigger cinehub_servers_updated_at before update on public.cinehub_servers
  for each row execute function public.update_updated_at_column();

insert into public.cinehub_servers (user_id, code, name, is_default_trial)
select u.id, seed.code, seed.name, seed.is_default
from auth.users u
cross join (values
  ('kyros','KYROS',true), ('vornak','VORNAK',false),
  ('kronos','KRONOS',false), ('zeus','ZEUS',false),
  ('fenix','FENIX',false), ('p2p','P2P BINSTREAM',false)
) as seed(code,name,is_default)
on conflict (user_id, code) do update set
  name = excluded.name, is_default_trial = excluded.is_default_trial;
