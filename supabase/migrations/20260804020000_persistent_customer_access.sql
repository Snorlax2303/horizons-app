-- Persistent checkout and access delivery data. Passwords/messages are sealed
-- by the API before storage and never exposed through anonymous PostgREST.

alter table public.union_direct_test_events
  add column if not exists access_password_ciphertext text,
  add column if not exists access_reply_ciphertext text;

alter table public.customer_panel_targets
  add column if not exists dns text,
  add column if not exists checkout_url text,
  add column if not exists access_password_ciphertext text,
  add column if not exists access_message_ciphertext text,
  add column if not exists access_delivered_at timestamptz;

create unique index if not exists customer_panel_targets_checkout_unique
  on public.customer_panel_targets(user_id, checkout_url)
  where checkout_url is not null;

alter table public.typebot_conversation_sessions
  add column if not exists identity_verified boolean not null default false,
  add column if not exists identity_provider text;

comment on column public.customer_panel_targets.checkout_url is
  'Stable checkout URL returned by the IPTV panel for this access and reused for future renewals.';
comment on column public.customer_panel_targets.access_password_ciphertext is
  'AES-GCM sealed access password; never store or log plaintext in the database.';
comment on column public.typebot_conversation_sessions.identity_verified is
  'True only when the transport adapter proves that the sender owns the session phone number.';
