create type log_level as enum ('info', 'warning', 'error');

create table if not exists logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  level log_level not null,
  entity_type text,
  entity_id text,
  message text not null,
  details_json jsonb default '{}'::jsonb
);

-- Indexes for performance
create index if not exists logs_level_idx on logs (level);
create index if not exists logs_entity_type_idx on logs (entity_type);
create index if not exists logs_timestamp_idx on logs (timestamp desc);

-- RLS Policies
alter table logs enable row level security;

create policy "Enable insert for authenticated users only"
  on logs for insert
  to authenticated
  with check (true);

create policy "Enable read access for authenticated users only"
  on logs for select
  to authenticated
  using (true);