-- Migration: member_connections table
-- Tracks headhunting connections between chapter members (active ↔ alumni)
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql

create table if not exists member_connections (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references chapters(id) on delete cascade,
  member_a_id uuid not null references chapter_members(id) on delete cascade,
  member_b_id uuid not null references chapter_members(id) on delete cascade,
  status      text not null default 'intro_made'
              check (status in ('intro_made', 'in_conversation', 'hired', 'no_fit')),
  notes       text,
  created_at  timestamptz default now()
);

-- Index for fast lookups by chapter
create index if not exists member_connections_chapter_id_idx on member_connections(chapter_id);

-- Index for fast lookups by either member
create index if not exists member_connections_member_a_idx on member_connections(member_a_id);
create index if not exists member_connections_member_b_idx on member_connections(member_b_id);
