-- Vincula procedimentos (tutoriais) ao app cadastrado por servidor e expoe
-- a base para o catálogo reutilizável de apps nas páginas de Operacoes e
-- Procedimentos.

alter table public.server_delivery_profiles
  add column if not exists display_order integer not null default 0;

alter table public.tutorial_media_slots
  add column if not exists server_delivery_profile_id uuid references public.server_delivery_profiles(id) on delete set null;

create index if not exists tutorial_slots_delivery_profile_idx
  on public.tutorial_media_slots(user_id, server_delivery_profile_id, sort_order);

create index if not exists delivery_profiles_server_category_idx
  on public.server_delivery_profiles(user_id, cinehub_server_id, device_category, display_order);
