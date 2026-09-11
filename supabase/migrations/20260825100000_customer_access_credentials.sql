-- Credenciais de acesso por aplicativo (sem DNS).
-- Substitui o modelo antigo (um único par usuario/senha/DNS por alvo) por um
-- modelo onde cada alvo de cliente pode ter varios apps, cada um com seus
-- proprios dados de instalacao e credenciais.

create table if not exists public.customer_access_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_panel_target_id uuid not null references public.customer_panel_targets(id) on delete cascade,
  app_category text not null check (app_category in (
    'smart_tv','android_tv','tv_box','android','ios','computer','fire_tv','console','other'
  )),
  app_name text not null,
  install_url text,
  code text,
  username text,
  password_ciphertext text,
  notes text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_access_credentials_target_idx
  on public.customer_access_credentials(user_id, customer_panel_target_id, display_order);

alter table public.customer_access_credentials enable row level security;

drop policy if exists "customer_access_credentials_owner" on public.customer_access_credentials;
create policy "customer_access_credentials_owner" on public.customer_access_credentials for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.customer_access_credentials from anon;
grant select,insert,update,delete on public.customer_access_credentials to authenticated;
