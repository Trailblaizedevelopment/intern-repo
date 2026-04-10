import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Get submission details for a chapter
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { id: chapterId } = await params;

    // Get the submission data
    const { data: submission, error: submissionError } = await supabase
      .from('onboarding_submissions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .single();

    if (submissionError && submissionError.code !== 'PGRST116') {
      console.error('Submission error:', submissionError);
    }

    // Get executives
    const { data: executives, error: execError } = await supabase
      .from('chapter_executives')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: true });

    if (execError) {
      console.error('Executives error:', execError);
    }

    // Get outreach channels
    const { data: channels, error: channelsError } = await supabase
      .from('chapter_outreach_channels')
      .select('*')
      .eq('chapter_id', chapterId);

    if (channelsError) {
      console.error('Channels error:', channelsError);
    }

    // Get chapter details
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select(`
        id, chapter_name, school, fraternity, chapter_designation, 
        year_founded, estimated_alumni, instagram_handle, 
        instagram_photo_url, alumni_list_url, scheduled_demo_time,
        onboarding_submitted_at, contact_name, contact_email
      `)
      .eq('id', chapterId)
      .single();

    if (chapterError) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        chapter,
        submission: submission?.submission_data || null,
        submitted_at: submission?.submitted_at || chapter.onboarding_submitted_at,
        executives: executives || [],
        outreach_channels: channels || [],
      },
      error: null,
    });
  } catch (err) {
    console.error('Error getting submission:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to get submission', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
