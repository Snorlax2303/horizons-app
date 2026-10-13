-- Configurações de integração editáveis pelo painel (ex.: chave do OmniRoute).
-- Segredos ficam em `secret_ciphertext`, cifrados pela API (AES-256-GCM);
-- o banco nunca recebe a chave em texto puro. Acesso somente via service role.
create table if not exists public.integration_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  secret_ciphertext text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;

-- Sem políticas para anon/authenticated: o navegador não lê nem grava aqui.
revoke all on table public.integration_settings from anon, authenticated;
grant all on table public.integration_settings to service_role;

comment on table public.integration_settings is
  'Configurações de integrações do Horizons. Segredos cifrados pela API; somente service_role.';
