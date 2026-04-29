import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/call-logs?chapter_id=xxx — get all call logs for a chapter
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const chapterId = searchParams.get('chapter_id');

  let query = supabase.from('call_logs').select('*').order('called_at', { ascending: false });
  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Convert to the format the frontend expects (keyed by contact_id)
  const logsMap: Record<string, unknown> = {};
  for (const log of (data || [])) {
    // Keep the most recent log per contact
    if (!logsMap[log.contact_id] || log.called_at > (logsMap[log.contact_id] as { calledAt: string }).calledAt) {
      logsMap[log.contact_id] = {
        contactId: log.contact_id,
        status: log.status,
        notes: log.notes || '',
        tags: log.tags || [],
        calledBy: log.called_by || '',
        calledAt: log.called_at || '',
        followUpDate: log.follow_up_date || undefined,
        followUpCompleted: log.follow_up_completed || false,
        contactSnapshot: log.contact_snapshot || undefined,
      };
    }
  }

  return NextResponse.json({ logs: logsMap, total: data?.length || 0 });
}

// POST /api/call-logs — create or update a call log
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await request.json();
  const { contactId, chapterId, status, notes, tags, calledBy, calledAt, followUpDate, followUpCompleted, contactSnapshot } = body;

  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('call_logs')
    .upsert({
      contact_id: contactId,
      chapter_id: chapterId || null,
      status: status || 'called',
      notes: notes || '',
      tags: tags || [],
      called_by: calledBy || '',
      called_at: calledAt || new Date().toISOString(),
      follow_up_date: followUpDate || null,
      follow_up_completed: followUpCompleted || false,
      contact_snapshot: contactSnapshot || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'contact_id' })
    .select()
    .single();

  if (error) {
    // If upsert fails (maybe no unique constraint), try insert
    const { data: d2, error: e2 } = await supabase
      .from('call_logs')
      .insert({
        contact_id: contactId,
        chapter_id: chapterId || null,
        status: status || 'called',
        notes: notes || '',
        tags: tags || [],
        called_by: calledBy || '',
        called_at: calledAt || new Date().toISOString(),
        follow_up_date: followUpDate || null,
        follow_up_completed: followUpCompleted || false,
        contact_snapshot: contactSnapshot || null,
      })
      .select()
      .single();

    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, log: d2 });
  }

  return NextResponse.json({ ok: true, log: data });
}
