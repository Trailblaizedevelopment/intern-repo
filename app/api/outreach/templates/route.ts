import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DEFAULT_TEMPLATES = [
  {
    touch_number: 1,
    template_text: 'Hey is this {first_name} {last_name}? My name is {sender_name}, and I am checking to verify your phone number for the {school} {fraternity} alumni list.',
  },
  {
    touch_number: 2,
    template_text: "Great, I'm reaching out because we partnered with {school} {fraternity} to launch Trailblaize, a free LinkedIn-style platform that connects actives and alumni. Here's the signup link: {signup_link}",
  },
  {
    touch_number: 3,
    template_text: "Hey {first_name}, just following up — wanted to make sure you saw the link to join the {fraternity} alumni network. It's free and takes 30 seconds: {signup_link}",
  },
];

/**
 * GET /api/outreach/templates?chapter_id={id}
 * Returns active templates for a chapter. Falls back to defaults if none exist.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } }, { status: 500 });
  }

  const chapterId = request.nextUrl.searchParams.get('chapter_id');
  if (!chapterId) {
    return NextResponse.json({ data: null, error: { message: 'chapter_id required', code: 'VALIDATION_ERROR' } }, { status: 400 });
  }

  const { data: templates, error } = await supabase
    .from('outreach_templates')
    .select('*')
    .eq('chapter_id', chapterId)
    .eq('is_active', true)
    .order('touch_number', { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: { message: error.message, code: 'DB_ERROR' } }, { status: 500 });
  }

  // If no custom templates, return defaults
  if (!templates || templates.length === 0) {
    return NextResponse.json({
      data: {
        templates: DEFAULT_TEMPLATES.map((t, i) => ({
          id: `default-${t.touch_number}`,
          chapter_id: chapterId,
          ...t,
          is_active: true,
          is_default: true,
        })),
        using_defaults: true,
      },
      error: null,
    });
  }

  return NextResponse.json({ data: { templates, using_defaults: false }, error: null });
}

/**
 * POST /api/outreach/templates
 * Body: { chapter_id, touch_number, template_text }
 * Creates or updates a template for a chapter + touch.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } }, { status: 500 });
  }

  try {
    const { chapter_id, touch_number, template_text } = await request.json();

    if (!chapter_id || !touch_number || !template_text) {
      return NextResponse.json({ data: null, error: { message: 'chapter_id, touch_number, and template_text required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    // Deactivate existing template for this touch
    await supabase
      .from('outreach_templates')
      .update({ is_active: false })
      .eq('chapter_id', chapter_id)
      .eq('touch_number', touch_number);

    // Insert new template
    const { data, error } = await supabase
      .from('outreach_templates')
      .insert({ chapter_id, touch_number, template_text, is_active: true })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Error saving template:', err);
    return NextResponse.json({ data: null, error: { message: 'Failed to save template', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}

/**
 * POST /api/outreach/templates/seed
 * Body: { chapter_id }
 * Seeds default templates for a chapter (if none exist).
 */
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } }, { status: 500 });
  }

  try {
    const { chapter_id } = await request.json();
    if (!chapter_id) {
      return NextResponse.json({ data: null, error: { message: 'chapter_id required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    // Check if templates already exist
    const { count } = await supabase
      .from('outreach_templates')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapter_id)
      .eq('is_active', true);

    if (count && count > 0) {
      return NextResponse.json({ data: { seeded: 0, message: 'Templates already exist' }, error: null });
    }

    const { error } = await supabase
      .from('outreach_templates')
      .insert(DEFAULT_TEMPLATES.map(t => ({ chapter_id, ...t, is_active: true })));

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data: { seeded: DEFAULT_TEMPLATES.length }, error: null });
  } catch (err) {
    console.error('Error seeding templates:', err);
    return NextResponse.json({ data: null, error: { message: 'Failed to seed templates', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
