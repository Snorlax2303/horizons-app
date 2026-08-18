-- Conversation intake and sales qualification for the self-hosted Typebot.
-- No media binary or panel password is stored in these tables.

create table if not exists public.lead_qualification_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  primary_intent text check (primary_intent in ('trial','renewal','purchase','support','finance','human')),
  installation_location text,
  device_category text,
  device_brand text,
  device_model_hint text,
  app_installed text,
  recommended_app text,
  requested_screens integer check (requested_screens between 1 and 99),
  simultaneous_screens integer check (simultaneous_screens between 1 and 99),
  plan_term text,
  control_media_refs jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, prospect_id)
);

create table if not exists public.typebot_conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,
  phone text not null,
  prospect_id uuid references public.prospects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  intent text check (intent in ('trial','renewal','purchase','support','finance','human')),
  current_step text,
  status text not null default 'active' check (status in ('active','waiting_payment','waiting_human','completed','expired')),
  context jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, session_key)
);

create table if not exists public.conversation_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.typebot_conversation_sessions(id) on delete set null,
  prospect_id uuid references public.prospects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  department text not null check (department in ('sales','support','finance','general')),
  reason text not null,
  summary text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','assigned','resolved','cancelled')),
  assigned_phone text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  test_request_id uuid references public.test_requests(id) on delete set null,
  session_id uuid references public.typebot_conversation_sessions(id) on delete set null,
  purpose text not null check (purpose in ('new_subscription','trial_conversion','renewal')),
  plan_name text,
  plan_term text,
  simultaneous_screens integer not null default 1 check (simultaneous_screens between 1 and 99),
  required_accounts integer not null default 1 check (required_accounts between 1 and 99),
  amount numeric(12,2),
  status text not null default 'draft' check (status in ('draft','quoted','waiting_payment','paid','provisioning','completed','manual_review','cancelled')),
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.renewal_requests
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null,
  add column if not exists sales_order_id uuid references public.sales_orders(id) on delete set null,
  add column if not exists purpose text not null default 'renewal'
    check (purpose in ('renewal','new_subscription','trial_conversion'));

alter table public.union_direct_test_events
  add column if not exists prospect_id uuid references public.prospects(id) on delete set null,
  add column if not exists contact_name text;

create index if not exists lead_qualification_profiles_prospect_idx on public.lead_qualification_profiles(prospect_id);
create index if not exists typebot_sessions_phone_idx on public.typebot_conversation_sessions(user_id,phone,last_seen_at desc);
create index if not exists conversation_handoffs_queue_idx on public.conversation_handoffs(user_id,department,status,created_at);
create index if not exists sales_orders_pipeline_idx on public.sales_orders(user_id,status,created_at desc);

alter table public.lead_qualification_profiles enable row level security;
alter table public.typebot_conversation_sessions enable row level security;
alter table public.conversation_handoffs enable row level security;
alter table public.sales_orders enable row level security;

create policy "lead_qualification_profiles_owner" on public.lead_qualification_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "typebot_conversation_sessions_owner" on public.typebot_conversation_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "conversation_handoffs_owner" on public.conversation_handoffs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sales_orders_owner" on public.sales_orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists lead_qualification_profiles_updated_at on public.lead_qualification_profiles;
create trigger lead_qualification_profiles_updated_at before update on public.lead_qualification_profiles for each row execute function public.update_updated_at_column();
drop trigger if exists conversation_handoffs_updated_at on public.conversation_handoffs;
create trigger conversation_handoffs_updated_at before update on public.conversation_handoffs for each row execute function public.update_updated_at_column();
drop trigger if exists sales_orders_updated_at on public.sales_orders;
create trigger sales_orders_updated_at before update on public.sales_orders for each row execute function public.update_updated_at_column();

revoke all on public.lead_qualification_profiles, public.typebot_conversation_sessions, public.conversation_handoffs, public.sales_orders from anon;
grant select,insert,update on public.lead_qualification_profiles, public.typebot_conversation_sessions, public.conversation_handoffs, public.sales_orders to authenticated;
