alter table public.admin_assistant_confirmations
  drop constraint if exists admin_assistant_confirmations_channel_check;

alter table public.admin_assistant_confirmations
  add constraint admin_assistant_confirmations_channel_check
  check (channel in ('web','whatsapp','telegram','api','test'));
