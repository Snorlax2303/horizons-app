-- Register Elite IPTV and CineHub as operational servers in the platform.

alter table public.cinehub_servers
  drop constraint if exists cinehub_servers_code_check;

alter table public.cinehub_servers
  add constraint cinehub_servers_code_check
  check (code in ('kyros','vornak','kronos','zeus','fenix','p2p','cinehub','elite'));

insert into public.cinehub_servers (user_id, code, name, provider, active, is_default_trial)
select u.id, seed.code, seed.name, seed.provider, true, false
from auth.users u
cross join (values
  ('cinehub','CineHub','cinehub'),
  ('elite','Elite IPTV','elite')
) as seed(code, name, provider)
on conflict (user_id, code) do update set
  name = excluded.name,
  provider = excluded.provider,
  active = true;
