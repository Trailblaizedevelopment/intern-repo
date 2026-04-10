// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/portal/leads/[id]
 * Update a personal lead
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = [
      'name', 'email', 'phone', 'organization', 'lead_type',
      'status', 'next_followup', 'notes', 'first_contact', 'last_contact',
    ];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No valid fields to update', code: 'INVALID_UPDATE' } },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('personal_leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: { message: 'Lead not found', code: 'NOT_FOUND' } },
          { status: 404 }
        );
      }
      console.error('Error updating portal lead:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Portal lead PATCH error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portal/leads/[id]
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { error } = await getSupabaseAdmin()
      .from('personal_leads')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting portal lead:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error) {
    console.error('Portal lead DELETE error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
