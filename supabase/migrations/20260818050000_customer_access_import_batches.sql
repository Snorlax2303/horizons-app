create table if not exists public.customer_access_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_channel text not null check (source_channel in ('telegram','web','api')),
  source_message_id text,
  filename text not null,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation','completed','cancelled','failed')),
  total_rows integer not null,
  ready_rows integer not null,
  blocked_rows integer not null,
  summary jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, source_channel, source_message_id)
);

create table if not exists public.customer_access_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.customer_access_import_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  row_number integer not null,
  customer_id uuid references public.customers(id) on delete set null,
  legacy_server_id uuid references public.servers(id) on delete set null,
  cinehub_server_id uuid references public.cinehub_servers(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  normalized_data jsonb not null,
  password_ciphertext text not null,
  access_message_ciphertext text,
  validation_status text not null check (validation_status in ('ready','blocked')),
  validation_errors jsonb not null default '[]'::jsonb,
  import_status text not null default 'pending' check (import_status in ('pending','imported','failed')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number),
  check (validation_status = 'blocked' or ((legacy_server_id is null) <> (cinehub_server_id is null)))
);

create index if not exists customer_access_import_batches_status_idx
  on public.customer_access_import_batches(user_id,status,created_at desc);
create index if not exists customer_access_import_items_batch_idx
  on public.customer_access_import_items(batch_id,validation_status,row_number);

alter table public.customer_access_import_batches enable row level security;
alter table public.customer_access_import_items enable row level security;
drop policy if exists "customer_access_import_batches_owner" on public.customer_access_import_batches;
drop policy if exists "customer_access_import_items_owner" on public.customer_access_import_items;
create policy "customer_access_import_batches_owner" on public.customer_access_import_batches for select using (auth.uid() = user_id);
create policy "customer_access_import_items_owner" on public.customer_access_import_items for select using (auth.uid() = user_id);
revoke all on public.customer_access_import_batches from anon, authenticated;
revoke all on public.customer_access_import_items from anon, authenticated;
grant select on public.customer_access_import_batches to authenticated;
grant select on public.customer_access_import_items to authenticated;

create or replace function public.execute_customer_access_import_batch(
  p_user_id uuid,
  p_batch_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  batch public.customer_access_import_batches%rowtype;
  item public.customer_access_import_items%rowtype;
  customer public.customers%rowtype;
  target public.customer_panel_targets%rowtype;
  data jsonb;
  imported_count integer := 0;
begin
  select * into batch from public.customer_access_import_batches
  where id = p_batch_id and user_id = p_user_id and status = 'pending_confirmation'
  for update;
  if not found then raise exception 'Lote não encontrado ou já processado'; end if;

  for item in
    select * from public.customer_access_import_items
    where batch_id = batch.id and user_id = p_user_id and validation_status = 'ready'
    order by row_number for update
  loop
    data := item.normalized_data;
    if item.customer_id is null then
      insert into public.customers (
        user_id,name,phone,plan_id,value,quantity_screens,due_day,status,paid,notes,server_ids
      ) values (
        p_user_id,data->>'name',data->>'phone',item.plan_id,
        nullif(data->>'value','')::numeric,greatest(coalesce(nullif(data->>'screens','')::integer,1),1),
        nullif(data->>'due_day','')::integer,'active',false,'Importado de arquivo confirmado no Telegram','[]'::jsonb
      ) returning * into customer;
      insert into public.customer_phones(customer_id,phone,is_primary) values(customer.id,customer.phone,true);
    else
      select * into customer from public.customers where id=item.customer_id and user_id=p_user_id for update;
      update public.customers set
        name = coalesce(nullif(data->>'name',''),name),
        plan_id = coalesce(item.plan_id,plan_id),
        value = coalesce(nullif(data->>'value','')::numeric,value),
        quantity_screens = coalesce(nullif(data->>'screens','')::integer,quantity_screens),
        due_day = coalesce(nullif(data->>'due_day','')::integer,due_day)
      where id=customer.id returning * into customer;
    end if;

    select * into target from public.customer_panel_targets
    where user_id=p_user_id and customer_id=customer.id and active=true and is_primary=true
    order by created_at desc limit 1 for update;

    if target.id is not null and target.server_id is not distinct from item.legacy_server_id
      and target.cinehub_server_id is not distinct from item.cinehub_server_id then
      update public.customer_panel_targets set
        external_username=data->>'username', external_plan=nullif(data->>'plan',''),
        screens=greatest(coalesce(nullif(data->>'screens','')::integer,1),1),
        dns=nullif(data->>'dns',''), checkout_url=nullif(data->>'checkout_url',''),
        access_password_ciphertext=item.password_ciphertext,
        access_message_ciphertext=item.access_message_ciphertext,
        valid_until=nullif(data->>'valid_until','')::timestamptz,
        notes='Acesso atualizado por importação confirmada.', updated_at=now()
      where id=target.id;
    else
      update public.customer_panel_targets set active=false,is_primary=false,deactivated_at=now(),updated_at=now()
      where user_id=p_user_id and customer_id=customer.id and active=true;
      insert into public.customer_panel_targets (
        user_id,customer_id,server_id,cinehub_server_id,external_username,external_plan,
        screens,active,is_primary,access_type,test_status,dns,checkout_url,
        access_password_ciphertext,access_message_ciphertext,valid_until,notes
      ) values (
        p_user_id,customer.id,item.legacy_server_id,item.cinehub_server_id,data->>'username',nullif(data->>'plan',''),
        greatest(coalesce(nullif(data->>'screens','')::integer,1),1),true,true,'direct','not_applicable',
        nullif(data->>'dns',''),nullif(data->>'checkout_url',''),item.password_ciphertext,item.access_message_ciphertext,
        nullif(data->>'valid_until','')::timestamptz,'Acesso criado por importação confirmada.'
      ) returning * into target;
    end if;

    if item.legacy_server_id is not null then
      update public.customers set server_ids=jsonb_build_array(item.legacy_server_id) where id=customer.id;
    end if;
    update public.customer_access_import_items set import_status='imported',
      result=jsonb_build_object('customer_id',customer.id,'access_id',target.id)
    where id=item.id;
    imported_count := imported_count + 1;
  end loop;

  update public.customer_access_import_batches set status='completed',completed_at=now(),
    summary=summary || jsonb_build_object('imported_rows',imported_count)
  where id=batch.id;
  return jsonb_build_object('batch_id',batch.id,'imported_rows',imported_count,'blocked_rows',batch.blocked_rows);
end;
$$;

revoke all on function public.execute_customer_access_import_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.execute_customer_access_import_batch(uuid,uuid) to service_role;
