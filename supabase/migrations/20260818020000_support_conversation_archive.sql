-- Reviewable support corpus. Collection is opt-in by Evolution instance and
-- never enables automatic replies.

create table if not exists public.support_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_name text not null,
  external_message_id text not null,
  contact_phone text not null,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  content text,
  occurred_at timestamptz not null default now(),
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending','reviewed','excluded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, instance_name, external_message_id)
);

create index if not exists support_messages_contact_time_idx
  on public.support_conversation_messages(user_id, contact_phone, occurred_at desc);
create index if not exists support_messages_review_idx
  on public.support_conversation_messages(user_id, analysis_status, occurred_at desc);

alter table public.support_conversation_messages enable row level security;
drop policy if exists "support_conversation_messages_owner" on public.support_conversation_messages;
create policy "support_conversation_messages_owner"
  on public.support_conversation_messages for select
  using (auth.uid() = user_id);

revoke all on public.support_conversation_messages from anon, authenticated;
grant select on public.support_conversation_messages to authenticated;

