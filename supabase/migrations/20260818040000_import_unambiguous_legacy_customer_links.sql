-- Import only unambiguous legacy customer -> server associations. This does
-- not invent panel credentials and deliberately skips customers with zero or
-- multiple legacy servers.

insert into public.customer_panel_targets (
  user_id,
  customer_id,
  server_id,
  screens,
  active,
  is_primary,
  access_type,
  test_status,
  notes
)
select
  customer.user_id,
  customer.id,
  (customer.server_ids->>0)::uuid,
  greatest(coalesce(customer.quantity_screens, 1), 1),
  true,
  true,
  'direct',
  'not_applicable',
  'Servidor importado do vínculo legado; credenciais do painel ainda precisam ser cadastradas.'
from public.customers customer
where jsonb_typeof(customer.server_ids) = 'array'
  and jsonb_array_length(customer.server_ids) = 1
  and exists (
    select 1 from public.servers server
    where server.id = (customer.server_ids->>0)::uuid
      and server.user_id = customer.user_id
  )
  and not exists (
    select 1 from public.customer_panel_targets target
    where target.user_id = customer.user_id
      and target.customer_id = customer.id
      and target.active = true
  );
