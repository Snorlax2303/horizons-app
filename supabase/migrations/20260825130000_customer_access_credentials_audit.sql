-- Coluna de auditoria para saber quem alterou cada credencial.

alter table public.customer_access_credentials
  add column if not exists changed_by uuid references auth.users(id) on delete set null;
