-- ============================================================================
-- MIGRATION: per-chapter outreach architecture
-- Date: 2026-03-27
-- Branch: tony/alumni-per-chapter-v1
--
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql
-- ============================================================================

-- 1a. Create outreach_message_templates table
create table if not exists outreach_message_templates (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references chapters(id) on delete cascade,
  touch_number int not null check (touch_number in (1, 2, 3)),
  message_body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(chapter_id, touch_number)
);

-- 1b. Add round-robin tracking to linq_line_config
alter table linq_line_config add column if not exists last_used_at timestamptz;
alter table linq_line_config add column if not exists round_robin_sequence int default 0;

-- 1c. Update outreach_batches to support per-chapter
alter table outreach_batches add column if not exists chapter_id uuid references chapters(id);
create index if not exists idx_outreach_batches_chapter_date on outreach_batches(chapter_id, scheduled_date);
