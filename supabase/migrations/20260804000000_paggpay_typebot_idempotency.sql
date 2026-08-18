alter table public.renewal_requests
  add column if not exists source text,
  add column if not exists source_idempotency_key text;

create unique index if not exists renewal_requests_source_idempotency_unique
  on public.renewal_requests(user_id, source, source_idempotency_key)
  where source is not null and source_idempotency_key is not null;
