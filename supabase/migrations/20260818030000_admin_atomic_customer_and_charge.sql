-- Atomic administrative writes used by the confirmed Telegram assistant.

create or replace function public.create_customer_with_primary_phone(
  p_user_id uuid,
  p_name text,
  p_phone text,
  p_plan_id uuid,
  p_value numeric,
  p_quantity_screens integer,
  p_due_day integer,
  p_status text,
  p_paid boolean,
  p_notes text
) returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.customers;
begin
  insert into public.customers (
    user_id, name, phone, plan_id, value, quantity_screens, due_day,
    status, paid, notes, server_ids
  ) values (
    p_user_id, p_name, p_phone, p_plan_id, p_value, p_quantity_screens,
    p_due_day, p_status, p_paid, p_notes, '{}'::uuid[]
  ) returning * into created;

  insert into public.customer_phones (customer_id, phone, is_primary)
  values (created.id, p_phone, true);

  return created;
end;
$$;

create or replace function public.update_customer_with_primary_phone(
  p_user_id uuid,
  p_customer_id uuid,
  p_changes jsonb,
  p_sync_phone boolean default false
) returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.customers;
  allowed_keys constant text[] := array[
    'name','phone','plan_id','value','quantity_screens','due_day','status','paid','notes'
  ];
begin
  if exists (
    select 1 from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) as key
    where not (key = any(allowed_keys))
  ) then
    raise exception 'unsupported customer field';
  end if;

  update public.customers set
    name = case when p_changes ? 'name' then p_changes->>'name' else name end,
    phone = case when p_changes ? 'phone' then p_changes->>'phone' else phone end,
    plan_id = case when p_changes ? 'plan_id' then (p_changes->>'plan_id')::uuid else plan_id end,
    value = case when p_changes ? 'value' then (p_changes->>'value')::numeric else value end,
    quantity_screens = case when p_changes ? 'quantity_screens' then (p_changes->>'quantity_screens')::integer else quantity_screens end,
    due_day = case when p_changes ? 'due_day' then (p_changes->>'due_day')::integer else due_day end,
    status = case when p_changes ? 'status' then p_changes->>'status' else status end,
    paid = case when p_changes ? 'paid' then (p_changes->>'paid')::boolean else paid end,
    notes = case when p_changes ? 'notes' then p_changes->>'notes' else notes end
  where id = p_customer_id and user_id = p_user_id
  returning * into updated;

  if updated.id is null then
    raise exception 'customer not found';
  end if;

  if p_sync_phone then
    delete from public.customer_phones where customer_id = updated.id;
    insert into public.customer_phones (customer_id, phone, is_primary)
    values (updated.id, updated.phone, true);
  end if;

  return updated;
end;
$$;

create or replace function public.record_paggpay_charge(
  p_user_id uuid,
  p_renewal_id uuid,
  p_customer_id uuid,
  p_provider_event_id text,
  p_amount numeric,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
begin
  if not exists (
    select 1 from public.renewal_requests
    where id = p_renewal_id and user_id = p_user_id and customer_id = p_customer_id
  ) then
    raise exception 'renewal not found';
  end if;

  insert into public.payment_events (
    provider, provider_event_id, external_payment_id, customer_id,
    status, amount, payload
  ) values (
    'paggpay', p_provider_event_id, p_provider_event_id, p_customer_id,
    'pending', p_amount, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do update set
    customer_id = excluded.customer_id,
    amount = excluded.amount,
    payload = excluded.payload
  returning id into event_id;

  update public.renewal_requests set
    status = 'awaiting_payment', updated_at = now()
  where id = p_renewal_id and user_id = p_user_id;

  return event_id;
end;
$$;

revoke all on function public.create_customer_with_primary_phone(uuid,text,text,uuid,numeric,integer,integer,text,boolean,text) from public, anon, authenticated;
revoke all on function public.update_customer_with_primary_phone(uuid,uuid,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.record_paggpay_charge(uuid,uuid,uuid,text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.create_customer_with_primary_phone(uuid,text,text,uuid,numeric,integer,integer,text,boolean,text) to service_role;
grant execute on function public.update_customer_with_primary_phone(uuid,uuid,jsonb,boolean) to service_role;
grant execute on function public.record_paggpay_charge(uuid,uuid,uuid,text,numeric,jsonb) to service_role;
