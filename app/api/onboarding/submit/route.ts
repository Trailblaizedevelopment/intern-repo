import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { OnboardingFormData } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { token, formData } = await request.json() as {
      token: string;
      formData: OnboardingFormData;
    };

    if (!token || !formData) {
      return NextResponse.json(
        { data: null, error: { message: 'Token and form data are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Validate token and get chapter
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, onboarding_submitted_at')
      .eq('onboarding_token', token)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } },
        { status: 404 }
      );
    }

    // Check if already submitted
    if (chapter.onboarding_submitted_at) {
      return NextResponse.json(
        { data: null, error: { message: 'Onboarding has already been submitted', code: 'ALREADY_SUBMITTED' } },
        { status: 400 }
      );
    }

    const chapterId = chapter.id;

    // Start a transaction by doing all inserts
    // 1. Store raw submission data
    const { error: submissionError } = await supabase
      .from('onboarding_submissions')
      .insert({
        chapter_id: chapterId,
        submission_data: formData,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
      });

    if (submissionError) {
      console.error('Submission error:', submissionError);
      return NextResponse.json(
        { data: null, error: { message: 'Failed to save submission', code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // 2. Update chapter with form data
    const updateData: Record<string, unknown> = {
      onboarding_submitted_at: new Date().toISOString(),
      chapter_created: true,
      last_activity: new Date().toISOString().split('T')[0],
    };
    // Only set fields that are present in the form data
    if (formData.university) updateData.school = formData.university;
    if (formData.fraternity) updateData.fraternity = formData.fraternity;
    if (formData.chapter_designation) updateData.chapter_designation = formData.chapter_designation;
    if (formData.year_founded) updateData.year_founded = formData.year_founded;
    if (formData.estimated_alumni) updateData.estimated_alumni = formData.estimated_alumni;
    if (formData.active_members) updateData.active_members = formData.active_members;
    if (formData.instagram_handle) updateData.instagram_handle = formData.instagram_handle;
    if (formData.instagram_photo_url) updateData.instagram_photo_url = formData.instagram_photo_url;
    if (formData.alumni_list_file_url) updateData.alumni_list_url = formData.alumni_list_file_url;
    if (formData.scheduled_demo_time) updateData.scheduled_demo_time = formData.scheduled_demo_time;
    if (formData.executives?.[0]?.full_name) updateData.contact_name = formData.executives[0].full_name;
    if (formData.executives?.[0]?.email) updateData.contact_email = formData.executives[0].email;

    const { error: updateError } = await supabase
      .from('chapters')
      .update(updateData)
      .eq('id', chapterId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { data: null, error: { message: 'Failed to update chapter', code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // 3. Insert executives (only if provided)
    if (formData.executives && formData.executives.length > 0) {
      const executiveRecords = formData.executives
        .filter(exec => exec.full_name) // Only insert execs with names
        .map(exec => ({
          chapter_id: chapterId,
          full_name: exec.full_name,
          position: exec.position,
          custom_position: exec.custom_position,
          email: exec.email,
        }));

      if (executiveRecords.length > 0) {
        const { error: execError } = await supabase
          .from('chapter_executives')
          .insert(executiveRecords);

        if (execError) {
          console.error('Executives error:', execError);
          // Non-fatal, continue
        }
      }
    }

    // 4. Insert outreach channels
    if (formData.outreach_channels && formData.outreach_channels.length > 0) {
      const channelRecords = formData.outreach_channels.map(channel => ({
        chapter_id: chapterId,
        channel_type: channel.type,
        email_platform: channel.email_platform,
        email_subscriber_count: channel.email_subscriber_count,
        facebook_url: channel.facebook_url,
        facebook_member_count: channel.facebook_member_count,
        instagram_handle: channel.instagram_handle,
        instagram_follower_count: channel.instagram_follower_count,
        linkedin_url: channel.linkedin_url,
        linkedin_member_count: channel.linkedin_member_count,
        website_url: channel.website_url,
        description: channel.description,
      }));

      const { error: channelError } = await supabase
        .from('chapter_outreach_channels')
        .insert(channelRecords);

      if (channelError) {
        console.error('Channels error:', channelError);
        // Non-fatal, continue
      }
    }

    return NextResponse.json({
      data: {
        success: true,
        chapter_id: chapterId,
        message: 'Onboarding submitted successfully',
      },
      error: null,
    });
  } catch (err) {
    console.error('Error submitting onboarding:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to submit onboarding', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
