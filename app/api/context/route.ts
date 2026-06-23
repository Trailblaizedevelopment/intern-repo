import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/context
 * 
 * Unified context API for external agents (e.g., Greg on MacBook Air).
 * Returns pipeline, chapters, deals, active members, and key metrics.
 * 
 * Auth: Bearer token via x-api-key or Authorization header.
 * Query params:
 *   ?scope=all (default) — everything
 *   ?scope=pipeline — deals only
 *   ?scope=chapters — chapters only
 *   ?scope=contacts&chapter_id=xxx — contacts for a chapter
 *   ?scope=metrics — KPIs only
 */

const VALID_KEY = process.env.INTERNAL_API_KEY 
  || process.env.NEXT_PUBLIC_INTERNAL_API_KEY 
  || 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

function authenticate(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-api-key') || '';
  const token = authHeader.replace('Bearer ', '') || apiKeyHeader;
  return token === VALID_KEY;
}

export async function GET(request: NextRequest) {
  if (!authenticate(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const scope = request.nextUrl.searchParams.get('scope') || 'all';
  const chapterId = request.nextUrl.searchParams.get('chapter_id');

  const result: Record<string, unknown> = { scope, timestamp: new Date().toISOString() };

  try {
    // ── Chapters ──
    if (scope === 'all' || scope === 'chapters') {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('id, chapter_name, fraternity, school_name, status, mrr, contact_name, contact_email, health_score, created_at')
        .order('created_at', { ascending: false });
      result.chapters = chapters || [];
    }

    // ── Pipeline / Deals ──
    if (scope === 'all' || scope === 'pipeline') {
      const { data: deals } = await supabase
        .from('pipeline_deals')
        .select('id, org:org_id(name, school:school_id(name, conference), national_org:national_org_id(name, abbreviation)), stage, value, temperature, deal_type, category, assigned_to, contact:contact_id(name, email, phone), notes, last_touched, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      result.deals = deals || [];
    }

    // ── Contacts for a specific chapter ──
    if (scope === 'contacts' && chapterId) {
      const { data: contacts, count } = await supabase
        .from('alumni_contacts')
        .select('id, first_name, last_name, email, phone, outreach_status, is_imessage, assigned_line, class_year, company, job_title', { count: 'exact' })
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false })
        .limit(500);
      result.contacts = contacts || [];
      result.contact_count = count;
    }

    // ── Metrics ──
    if (scope === 'all' || scope === 'metrics') {
      const { data: chapters } = await supabase
        .from('chapters')
        .select('mrr, status');
      
      const activeChapters = (chapters || []).filter((c: any) => c.status === 'active');
      const totalMRR = activeChapters.reduce((sum: number, c: any) => sum + (c.mrr || 0), 0);

      const { count: totalContacts } = await supabase
        .from('alumni_contacts')
        .select('id', { count: 'exact', head: true });

      const { count: signedUp } = await supabase
        .from('alumni_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('outreach_status', 'signed_up');

      const { count: totalDeals } = await supabase
        .from('pipeline_deals')
        .select('id', { count: 'exact', head: true });

      result.metrics = {
        total_chapters: (chapters || []).length,
        active_chapters: activeChapters.length,
        total_mrr: totalMRR,
        total_arr: totalMRR * 12,
        total_alumni_contacts: totalContacts || 0,
        alumni_signed_up: signedUp || 0,
        total_deals: totalDeals || 0,
      };
    }

    // ── War Room campaigns ──
    if (scope === 'all' || scope === 'campaigns') {
      const { data: campaigns } = await supabase
        .from('war_room_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      result.campaigns = campaigns || [];
    }

    // ── Headhunting / Success tab members ──
    if (scope === 'all' || scope === 'headhunting') {
      const { data: headhunting } = await supabase
        .from('headhunting_members')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      result.headhunting = headhunting || [];
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
