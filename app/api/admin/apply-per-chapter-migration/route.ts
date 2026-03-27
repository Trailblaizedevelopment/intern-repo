import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const AUTH_TOKEN = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

/**
 * POST /api/admin/apply-per-chapter-migration
 * One-time migration to support per-chapter alumni outreach architecture.
 *
 * Steps:
 *  1a. Create outreach_message_templates table
 *  1b. Add round-robin tracking to linq_line_config
 *  1c. Add chapter_id to outreach_batches + index
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (auth !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const results: Record<string, string> = {};

  // ── 1a. Create outreach_message_templates ─────────────────────────────────
  try {
    // Try inserting a test row to check if table exists — if it throws PGRST205, we create it
    const { error: checkErr } = await supabase
      .from('outreach_message_templates')
      .select('id')
      .limit(1);

    if (checkErr && checkErr.code === 'PGRST205') {
      // Table doesn't exist — we can't create it via REST, but we'll note it
      results['outreach_message_templates'] = 'NEEDS_MANUAL_CREATE';
    } else {
      results['outreach_message_templates'] = 'EXISTS';
    }
  } catch {
    results['outreach_message_templates'] = 'CHECK_FAILED';
  }

  // ── 1b. Check linq_line_config round-robin columns ────────────────────────
  try {
    const { error: checkErr } = await supabase
      .from('linq_line_config')
      .select('last_used_at, round_robin_sequence')
      .limit(1);

    if (checkErr) {
      results['linq_line_config_cols'] = 'NEEDS_MANUAL_ALTER: ' + checkErr.message;
    } else {
      results['linq_line_config_cols'] = 'EXISTS';
    }
  } catch {
    results['linq_line_config_cols'] = 'CHECK_FAILED';
  }

  // ── 1c. Check outreach_batches chapter_id ────────────────────────────────
  try {
    const { error: checkErr } = await supabase
      .from('outreach_batches')
      .select('chapter_id')
      .limit(1);

    if (checkErr) {
      results['outreach_batches_chapter_id'] = 'NEEDS_MANUAL_ALTER: ' + checkErr.message;
    } else {
      results['outreach_batches_chapter_id'] = 'EXISTS';
    }
  } catch {
    results['outreach_batches_chapter_id'] = 'CHECK_FAILED';
  }

  return NextResponse.json({
    status: 'check_complete',
    results,
    sql_to_run: `
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql

-- 1a. Create outreach_message_templates
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
    `.trim(),
  });
}
