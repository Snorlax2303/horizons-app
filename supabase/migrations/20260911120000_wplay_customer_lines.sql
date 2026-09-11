-- Vínculo entre o cliente do Horizons e a linha do painel WPlay (wwpanel.link).
--
-- Por que existe: para instalar o app na TV do cliente precisamos do id da
-- linha no painel (`id_user`) — é ele que amarra `POST /lines/active/app` sem
-- depender do MAC sozinho. O MAC sozinho não identifica a linha.
--
-- Fluxo real do dono (2026-09-11):
--   1. cria-se o TESTE (trial) e ativa-se o app nesse mesmo teste — ativar app
--      em teste NÃO consome crédito, então o cliente já assiste;
--   2. o id do teste fica guardado em `external_test_line_id`;
--   3. só depois do pagamento a linha de produção é criada/ativada no painel;
--      o id dela passa a `external_line_id` com `external_line_kind='production'`.
--
-- NÃO aplicada automaticamente. Sem esta migração a aplicação continua
-- funcionando; apenas não persiste o vínculo da linha.

alter table public.customer_panel_targets
  add column if not exists external_line_id text,
  add column if not exists external_line_kind text not null default 'test',
  add column if not exists external_test_line_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_panel_targets_external_line_kind_check'
  ) then
    alter table public.customer_panel_targets
      add constraint customer_panel_targets_external_line_kind_check
      check (external_line_kind in ('test', 'production'));
  end if;
end
$$;

comment on column public.customer_panel_targets.external_line_id is
  'ID da linha no painel WPlay em uso (id_user). É o alvo da ativação de app por MAC.';
comment on column public.customer_panel_targets.external_line_kind is
  'test = linha de teste/trial; production = linha paga.';
comment on column public.customer_panel_targets.external_test_line_id is
  'ID da linha de teste preservado após a conversão para produção.';

create index if not exists customer_panel_targets_external_line_idx
  on public.customer_panel_targets (user_id, external_line_id)
  where external_line_id is not null;

-- MAC da TV usado na ativação do app. Cada app do cliente tem o próprio MAC,
-- então fica na credencial do app e não no alvo.
alter table public.customer_access_credentials
  add column if not exists mac_address text,
  add column if not exists app_activated_at timestamptz;

comment on column public.customer_access_credentials.mac_address is
  'MAC da TV informado pelo cliente para ativação do app no painel WPlay.';
comment on column public.customer_access_credentials.app_activated_at is
  'Quando o app foi ativado no painel (teste ou produção).';
