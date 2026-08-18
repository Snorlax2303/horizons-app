alter table public.admin_assistant_audit
  drop constraint if exists admin_assistant_audit_channel_check;

alter table public.admin_assistant_audit
  add constraint admin_assistant_audit_channel_check
  check (channel in ('web','whatsapp','telegram','api','test'));
