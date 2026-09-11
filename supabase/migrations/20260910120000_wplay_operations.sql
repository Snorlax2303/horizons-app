-- Auditoria das operações executadas contra o painel WPlay (wwpanel.link).
--
-- NÃO aplicada automaticamente. Operações de escrita no painel externo
-- consomem créditos e exigem WWPANEL_WRITES_ENABLED=true mais confirmação
-- explícita do operador. Sem esta tabela, a aplicação registra a operação
-- apenas em log estruturado e segue funcionando.

create table if not exists public.wplay_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_id text,
  status text not null,
  summary jsonb,
  created_at timestamptz not null default now()
);

alter table public.wplay_operations enable row level security;

drop policy if exists "wplay_operations_owner_read" on public.wplay_operations;
create policy "wplay_operations_owner_read" on public.wplay_operations
  for select using (auth.uid() = user_id);

create index if not exists wplay_operations_created_at_idx
  on public.wplay_operations (created_at desc);
