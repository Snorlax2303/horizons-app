-- Financial billing preparation: payment method per customer, recovery queue
-- and a planning RPC that never sends messages or charges customers.

alter table public.billing_reminder_queue
  add column if not exists payment_method text not null default 'manual'
    check (payment_method in ('checkout','pix','manual')),
  add column if not exists checkout_url text,
  add column if not exists recovery boolean not null default false,
  add column if not exists attempt_count integer not null default 0;

create table if not exists public.customer_recovery_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','reminded','recovered','cancelled','lost')),
  last_due_date date,
  reason text,
  payment_not_recognized_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, customer_id)
);

create index if not exists recovery_owner_status_idx
  on public.customer_recovery_queue(user_id, status, updated_at desc);

alter table public.customer_recovery_queue enable row level security;
drop policy if exists "customer_recovery_queue_owner" on public.customer_recovery_queue;
create policy "customer_recovery_queue_owner" on public.customer_recovery_queue for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.customer_recovery_queue from anon;
grant select,insert,update,delete on public.customer_recovery_queue to authenticated;

-- Plans reminders per customer by payment method and moves unrecognized
-- payments to the recovery queue after two weeks without recognition. Never
-- sends a message, never creates a charge and never touches an external panel.
create or replace function public.refresh_customer_billing(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  today date := current_date;
  planned_count integer := 0;
  recovery_count integer := 0;
  row_c record;
  v_target public.customer_panel_targets%rowtype;
  v_checkout text;
  v_method text;
  v_due date;
  v_paid boolean;
begin
  for row_c in
    select c.id, c.name, c.due_day, c.phone
    from public.customers c
    where c.user_id = p_user_id and c.status = 'active' and c.paid = false
      and c.due_day is not null
      and nullif(regexp_replace(coalesce(c.phone,''),'\D','','g'),'') is not null
  loop
    v_due := make_date(extract(year from today)::int, extract(month from today)::int,
      least(greatest(row_c.due_day,1), extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int));

    select * into v_target from public.customer_panel_targets t
    where t.user_id = p_user_id and t.customer_id = row_c.id
      and t.active = true and t.is_primary = true
    order by t.created_at desc limit 1;
    v_checkout := nullif(trim(coalesce(v_target.checkout_url,'')),'');
    v_method := case when v_checkout is not null then 'checkout' when v_target.id is not null then 'pix' else 'manual' end;

    select exists(
      select 1 from public.payment_events e
      where e.customer_id = row_c.id and e.status = 'paid'
        and e.paid_at >= (v_due - 1)::timestamp
    ) into v_paid;

    if v_paid then
      update public.customer_recovery_queue set status='recovered', updated_at=now()
      where user_id=p_user_id and customer_id=row_c.id and status in ('pending','reminded');
      update public.billing_reminder_queue set status='cancelled', updated_at=now()
      where user_id=p_user_id and customer_id=row_c.id and due_date=v_due and status='planned';
      continue;
    end if;

    if today > v_due + 14 then
      insert into public.customer_recovery_queue (user_id, customer_id, last_due_date, reason, payment_not_recognized_at, status)
      values (p_user_id, row_c.id, v_due, 'Pagamento não reconhecido após duas semanas do vencimento', now(), 'pending')
      on conflict (user_id, customer_id) do update set
        last_due_date = excluded.last_due_date,
        reason = excluded.reason,
        payment_not_recognized_at = excluded.payment_not_recognized_at,
        status = case when public.customer_recovery_queue.status in ('recovered','cancelled') then 'pending' else public.customer_recovery_queue.status end,
        updated_at = now();
      update public.billing_reminder_queue set status='cancelled', updated_at=now()
      where user_id=p_user_id and customer_id=row_c.id and due_date=v_due and status='planned';
      continue;
    end if;

    if today in (v_due - 3, v_due, v_due + 1, v_due + 3) then
      insert into public.billing_reminder_queue (user_id, customer_id, due_date, stage, payment_method, checkout_url, message_preview)
      values (
        p_user_id, row_c.id, v_due,
        case when today = v_due - 3 then 'before_3_days' when today = v_due then 'due_today'
             when today = v_due + 1 then 'overdue_1_day' else 'overdue_3_days' end,
        v_method, v_checkout,
        case
          when v_method = 'checkout' then 'Olá, ' || row_c.name || '! Sua mensalidade está próxima do vencimento. Pague pelo link: ' || v_checkout
          when v_method = 'pix' then 'Olá, ' || row_c.name || '! Sua mensalidade está próxima do vencimento. Pague via Pix e envie o comprovante por aqui.'
          else 'Olá, ' || row_c.name || '! Sua mensalidade está próxima do vencimento. Entre em contato para combinar o pagamento.'
        end
      )
      on conflict (user_id, customer_id, due_date, stage) do nothing;
    end if;
  end loop;

  select count(*) into planned_count from public.billing_reminder_queue
  where user_id=p_user_id and status='planned' and due_date=today;
  select count(*) into recovery_count from public.customer_recovery_queue
  where user_id=p_user_id and status in ('pending','reminded');
  return jsonb_build_object('planned_reminders', planned_count, 'recovery_pending', recovery_count);
end $$;

revoke all on function public.refresh_customer_billing(uuid) from public, anon, authenticated;
grant execute on function public.refresh_customer_billing(uuid) to service_role;
