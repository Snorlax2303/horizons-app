-- Manual Pix receipts are evidence for human review, never proof of settlement.
create table if not exists public.renewal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone text not null,
  external_username text,
  payment_url text,
  plan_name text,
  expected_amount numeric(12,2),
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment','awaiting_receipt','receipt_received','awaiting_bank_review',
    'payment_confirmed','renewal_pending','renewed','rejected','expired'
  )),
  confirmed_payment_event_id uuid references public.payment_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pix_receipts (
  id uuid primary key default gen_random_uuid(),
  renewal_request_id uuid not null references public.renewal_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_message_id text,
  media_type text not null check (media_type in ('image','pdf')),
  media_reference text not null,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','completed','failed')),
  extracted_data jsonb not null default '{}'::jsonb,
  confidence numeric(5,4),
  end_to_end_id text,
  amount numeric(12,2),
  paid_at timestamptz,
  payer_name text,
  recipient_name text,
  bank_name text,
  is_scheduled boolean,
  validation_flags jsonb not null default '[]'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','rejected','needs_new_receipt')),
  created_at timestamptz not null default now()
);

create unique index if not exists pix_receipts_user_e2e_unique
  on public.pix_receipts(user_id, end_to_end_id) where end_to_end_id is not null;
create unique index if not exists pix_receipts_user_message_unique
  on public.pix_receipts(user_id, whatsapp_message_id) where whatsapp_message_id is not null;
create index if not exists renewal_requests_user_status_idx on public.renewal_requests(user_id,status,created_at desc);
create index if not exists pix_receipts_request_idx on public.pix_receipts(renewal_request_id,created_at desc);

alter table public.renewal_requests enable row level security;
alter table public.pix_receipts enable row level security;
drop policy if exists "Users manage own renewal requests" on public.renewal_requests;
create policy "Users manage own renewal requests" on public.renewal_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own Pix receipts" on public.pix_receipts;
create policy "Users manage own Pix receipts" on public.pix_receipts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.renewal_requests from anon;
revoke all on public.pix_receipts from anon;
grant select,insert,update on public.renewal_requests to authenticated;
grant select,insert,update on public.pix_receipts to authenticated;
