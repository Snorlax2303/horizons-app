alter table public.admin_assistant_audit
  add column if not exists message_id text;

create unique index if not exists admin_assistant_audit_message_idx
  on public.admin_assistant_audit(user_id, channel, message_id)
  where message_id is not null;

comment on column public.admin_assistant_audit.message_id is
  'Transport message identifier used to prevent duplicate administrative WhatsApp processing.';
