-- Atomic customer access assignment and server migration.

alter table public.customer_panel_targets
  add column if not exists is_primary boolean not null default false,
  add column if not exists deactivated_at timestamptz,
  add column if not exists replaced_by_target_id uuid references public.customer_panel_targets(id) on delete set null;

with ranked as (
  select id, row_number() over (
    partition by user_id, customer_id
    order by active desc, updated_at desc nulls last, created_at desc
  ) as position
  from public.customer_panel_targets
  where active = true
)
update public.customer_panel_targets target
set is_primary = ranked.position = 1
from ranked
where target.id = ranked.id;

create unique index if not exists customer_panel_targets_one_primary_idx
  on public.customer_panel_targets(user_id, customer_id)
  where active = true and is_primary = true;

create index if not exists customer_panel_targets_server_history_idx
  on public.customer_panel_targets(user_id, customer_id, active, created_at desc);

create or replace function public.migrate_customer_server_access(
  p_user_id uuid,
  p_customer_id uuid,
  p_to_server_id uuid,
  p_reason text,
  p_external_username text,
  p_external_plan text,
  p_screens integer,
  p_dns text,
  p_checkout_url text,
  p_access_password_ciphertext text,
  p_access_message_ciphertext text,
  p_valid_until timestamptz,
  p_changed_by uuid default null,
  p_source text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_server public.cinehub_servers%rowtype;
  v_previous public.customer_panel_targets%rowtype;
  v_created public.customer_panel_targets%rowtype;
  v_history public.customer_server_history%rowtype;
begin
  if not (auth.role() = 'service_role' or auth.uid() = p_user_id) then
    raise exception 'Operação não autorizada';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Informe o motivo da vinculação ou troca';
  end if;
  if nullif(trim(p_external_username), '') is null then
    raise exception 'Informe o usuário do novo acesso';
  end if;
  if p_screens is null or p_screens < 1 then
    raise exception 'Quantidade de telas inválida';
  end if;
  if p_source not in ('manual','admin_assistant','import') then
    raise exception 'Origem da troca inválida';
  end if;

  select * into v_customer from public.customers
  where id = p_customer_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Cliente não encontrado'; end if;

  select * into v_server from public.cinehub_servers
  where id = p_to_server_id and user_id = p_user_id and active = true;
  if not found then raise exception 'Servidor de destino não encontrado ou inativo'; end if;

  select * into v_previous from public.customer_panel_targets
  where user_id = p_user_id and customer_id = p_customer_id
    and active = true and is_primary = true
  order by created_at desc limit 1
  for update;

  insert into public.customer_panel_targets (
    user_id, customer_id, cinehub_server_id, external_username, external_plan,
    screens, active, is_primary, dns, checkout_url,
    access_password_ciphertext, access_message_ciphertext, valid_until
  ) values (
    p_user_id, p_customer_id, p_to_server_id, trim(p_external_username),
    nullif(trim(p_external_plan), ''), p_screens, true, false,
    nullif(trim(p_dns), ''), nullif(trim(p_checkout_url), ''),
    p_access_password_ciphertext, p_access_message_ciphertext, p_valid_until
  ) returning * into v_created;

  update public.customer_panel_targets
  set active = false, is_primary = false, deactivated_at = now(),
      replaced_by_target_id = v_created.id, updated_at = now()
  where user_id = p_user_id and customer_id = p_customer_id
    and active = true and id <> v_created.id;

  update public.customer_panel_targets
  set is_primary = true, updated_at = now()
  where id = v_created.id
  returning * into v_created;

  insert into public.customer_server_history (
    user_id, customer_id, customer_panel_target_id, from_server_id,
    to_server_id, reason, changed_by, source, metadata
  ) values (
    p_user_id, p_customer_id, v_created.id, v_previous.cinehub_server_id,
    p_to_server_id, trim(p_reason), p_changed_by, p_source,
    jsonb_build_object(
      'previous_target_id', v_previous.id,
      'new_target_id', v_created.id,
      'external_username', v_created.external_username,
      'screens', v_created.screens
    )
  ) returning * into v_history;

  update public.customers
  set server_ids = case
    when v_server.code is null then server_ids
    else coalesce((
      select jsonb_agg(s.id)
      from public.servers s
      where s.user_id = p_user_id and lower(s.name) = lower(v_server.name)
    ), server_ids)
  end
  where id = p_customer_id;

  return jsonb_build_object(
    'access_id', v_created.id,
    'history_id', v_history.id,
    'from_server_id', v_previous.cinehub_server_id,
    'to_server_id', v_created.cinehub_server_id,
    'first_assignment', v_previous.id is null
  );
end;
$$;

revoke all on function public.migrate_customer_server_access(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,timestamptz,uuid,text) from public, anon;
grant execute on function public.migrate_customer_server_access(uuid,uuid,uuid,text,text,text,integer,text,text,text,text,timestamptz,uuid,text) to authenticated, service_role;

