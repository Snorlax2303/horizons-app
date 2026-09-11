-- Coluna de auditoria para delivery_profiles e tutorial_media_slots.

alter table public.server_delivery_profiles
  add column if not exists changed_by uuid references auth.users(id) on delete set null;

alter table public.tutorial_media_slots
  add column if not exists changed_by uuid references auth.users(id) on delete set null;
