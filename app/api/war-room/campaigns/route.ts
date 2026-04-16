/*
 * War Room Campaigns API
 *
 * Run in Supabase SQL editor before using:
 *
 * CREATE TABLE IF NOT EXISTS war_room_campaigns (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   name text NOT NULL,
 *   type text NOT NULL DEFAULT 'founder_led',
 *   school text,
 *   school_id uuid,
 *   status text NOT NULL DEFAULT 'active',
 *   rows jsonb NOT NULL DEFAULT '[]',
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { data, error } = await admin
    .from('war_room_campaigns')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...rest } = body;

  // Map camelCase frontend fields to snake_case DB columns
  const payload: Record<string, unknown> = {
    name: rest.name,
    type: rest.type ?? 'founder_led',
    school: rest.school ?? null,
    school_id: rest.schoolId ?? null,
    status: rest.status ?? 'active',
    rows: rest.rows ?? [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('war_room_campaigns')
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(dbRowToFrontend(data), { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (rest.name !== undefined)     payload.name      = rest.name;
  if (rest.type !== undefined)     payload.type      = rest.type;
  if (rest.school !== undefined)   payload.school    = rest.school;
  if (rest.schoolId !== undefined) payload.school_id = rest.schoolId;
  if (rest.status !== undefined)   payload.status    = rest.status;
  if (rest.rows !== undefined)     payload.rows      = rest.rows;

  const { data, error } = await admin
    .from('war_room_campaigns')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(dbRowToFrontend(data));
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await admin
    .from('war_room_campaigns')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Map snake_case DB row → camelCase Campaign object expected by the frontend
function dbRowToFrontend(row: Record<string, unknown>) {
  return {
    id:        row.id,
    name:      row.name,
    type:      row.type,
    school:    row.school ?? '',
    schoolId:  row.school_id ?? undefined,
    status:    row.status,
    rows:      row.rows ?? [],
    updatedAt: row.updated_at,
  };
}
