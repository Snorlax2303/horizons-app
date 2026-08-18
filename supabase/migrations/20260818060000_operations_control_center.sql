-- Safe operational control center: planning never sends a message or charges a customer.
create table if not exists public.customer_contact_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  task_type text not null check (task_type in ('missing_server','ambiguous_server','missing_credentials','missing_phone','missing_name')),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,customer_id,task_type)
);

create table if not exists public.billing_reminder_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  due_date date not null,
  stage text not null check (stage in ('before_3_days','due_today','overdue_1_day','overdue_3_days','manual')),
  status text not null default 'planned' check (status in ('planned','approved','sent','cancelled','failed')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp','telegram','manual')),
  message_preview text not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,customer_id,due_date,stage)
);

create table if not exists public.server_delivery_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_server_id uuid references public.servers(id) on delete cascade,
  cinehub_server_id uuid references public.cinehub_servers(id) on delete cascade,
  app_name text not null,
  device_category text not null default 'android_tv',
  partner_code text,
  downloader_code text,
  ntdown_code text,
  download_url text,
  dns text,
  instructions text,
  valid_from date,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((legacy_server_id is null) <> (cinehub_server_id is null))
);

create table if not exists public.tutorial_media_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_category text not null,
  manufacturer text,
  title text not null,
  media_type text not null default 'video' check (media_type in ('video','image','document')),
  media_url text,
  script_notes text,
  status text not null default 'pending_recording' check (status in ('pending_recording','recorded','published')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_tasks_owner_status_idx on public.customer_contact_tasks(user_id,status,task_type);
create index if not exists billing_reminders_owner_status_idx on public.billing_reminder_queue(user_id,status,due_date);
create index if not exists delivery_profiles_expiry_idx on public.server_delivery_profiles(user_id,active,valid_until);
create index if not exists tutorial_slots_owner_idx on public.tutorial_media_slots(user_id,status,device_category);

alter table public.customer_contact_tasks enable row level security;
alter table public.billing_reminder_queue enable row level security;
alter table public.server_delivery_profiles enable row level security;
alter table public.tutorial_media_slots enable row level security;

do $$ declare t text; begin
  foreach t in array array['customer_contact_tasks','billing_reminder_queue','server_delivery_profiles','tutorial_media_slots'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t || '_owner', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.refresh_horizons_operations(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare task_count integer; reminder_count integer; today date := current_date;
begin
  insert into public.tutorial_media_slots(user_id,device_category,manufacturer,title,script_notes,sort_order)
  select p_user_id,v.device_category,v.manufacturer,v.title,v.script_notes,v.sort_order
  from (values
    ('smart_tv','Samsung','Instalar e ativar na Samsung','Busca do app, instalação e entrada com código + usuário + senha.',10),
    ('smart_tv','LG','Instalar e ativar na LG','Busca do app, instalação e entrada com código + usuário + senha.',20),
    ('android_tv',null,'Instalar em Android/Google TV','Downloader/NTdown, instalação e login.',30),
    ('tv_box',null,'Instalar em TV Box','Instalação do APK e login.',40),
    ('android',null,'Instalar no celular Android','Download, permissão e login.',50),
    ('ios',null,'Instalar no iPhone/iPad','App Store e login.',60),
    ('computer',null,'Assistir no computador','Aplicativo ou navegador e login.',70)
  ) as v(device_category,manufacturer,title,script_notes,sort_order)
  where not exists(select 1 from public.tutorial_media_slots t where t.user_id=p_user_id and t.title=v.title);

  insert into public.customer_contact_tasks(user_id,customer_id,task_type,details)
  select p_user_id,c.id,
    case when nullif(regexp_replace(coalesce(c.phone,''),'\D','','g'),'') is null then 'missing_phone'
         when count(t.id)=0 then 'missing_server'
         when count(t.id)>1 then 'ambiguous_server'
         else 'missing_credentials' end,
    jsonb_build_object('name',c.name,'active_targets',count(t.id))
  from public.customers c
  left join public.customer_panel_targets t on t.customer_id=c.id and t.user_id=p_user_id and t.active=true
  where c.user_id=p_user_id
  group by c.id
  having nullif(regexp_replace(coalesce(c.phone,''),'\D','','g'),'') is null or count(t.id) <> 1
  on conflict(user_id,customer_id,task_type) do update set status='open',details=excluded.details,updated_at=now();

  insert into public.customer_contact_tasks(user_id,customer_id,task_type,details)
  select p_user_id,c.id,'missing_credentials',jsonb_build_object('name',c.name,'access_id',t.id)
  from public.customers c join public.customer_panel_targets t on t.customer_id=c.id and t.user_id=p_user_id
  where c.user_id=p_user_id and t.active=true and t.is_primary=true
    and (nullif(t.external_username,'') is null or nullif(t.access_password_ciphertext,'') is null)
  on conflict(user_id,customer_id,task_type) do update set status='open',details=excluded.details,updated_at=now();

  update public.customer_contact_tasks x set status='resolved',resolved_at=now(),updated_at=now()
  where x.user_id=p_user_id and x.status='open' and not exists (
    select 1 from public.customers c where c.id=x.customer_id and c.user_id=p_user_id and (
      (x.task_type='missing_phone' and nullif(regexp_replace(coalesce(c.phone,''),'\D','','g'),'') is null) or
      (x.task_type='missing_server' and not exists(select 1 from public.customer_panel_targets t where t.customer_id=c.id and t.active=true)) or
      (x.task_type='ambiguous_server' and (select count(*) from public.customer_panel_targets t where t.customer_id=c.id and t.active=true)>1) or
      (x.task_type='missing_credentials' and exists(select 1 from public.customer_panel_targets t where t.customer_id=c.id and t.active=true and t.is_primary=true and (nullif(t.external_username,'') is null or nullif(t.access_password_ciphertext,'') is null)))
    )
  );

  insert into public.billing_reminder_queue(user_id,customer_id,due_date,stage,message_preview)
  select p_user_id,c.id,make_date(extract(year from today)::int,extract(month from today)::int,least(greatest(c.due_day,1),extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int)),
    case
      when today = make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int)) - 3 then 'before_3_days'
      when today = make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int)) then 'due_today'
      when today = make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int)) + 1 then 'overdue_1_day'
      else 'overdue_3_days' end,
    'Olá, ' || c.name || '! Sua mensalidade está próxima do vencimento. Confira os dados antes do envio.'
  from public.customers c
  where c.user_id=p_user_id and c.status='active' and c.paid=false and c.due_day is not null
    and today in (
      make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int))-3,
      make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int)),
      make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int))+1,
      make_date(extract(year from today)::int,extract(month from today)::int,least(c.due_day,extract(day from (date_trunc('month',today)+interval '1 month - 1 day'))::int))+3)
  on conflict(user_id,customer_id,due_date,stage) do nothing;

  select count(*) into task_count from public.customer_contact_tasks where user_id=p_user_id and status='open';
  select count(*) into reminder_count from public.billing_reminder_queue where user_id=p_user_id and status='planned';
  return jsonb_build_object('open_tasks',task_count,'planned_reminders',reminder_count);
end $$;
revoke all on function public.refresh_horizons_operations(uuid) from public,anon,authenticated;
grant execute on function public.refresh_horizons_operations(uuid) to service_role;
