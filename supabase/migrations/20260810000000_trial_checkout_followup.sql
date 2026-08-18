alter table public.sales_orders
  add column if not exists union_direct_test_event_id uuid
    references public.union_direct_test_events(id) on delete set null;

create unique index if not exists sales_orders_union_test_unique
  on public.sales_orders(union_direct_test_event_id)
  where union_direct_test_event_id is not null;

create index if not exists sales_orders_waiting_checkout_idx
  on public.sales_orders(status, amount, created_at desc)
  where status = 'waiting_payment';
