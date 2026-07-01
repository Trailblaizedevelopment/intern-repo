/**
 * POST /api/call-logs/migrate-platform-ids
 *
 * One-time (re-runnable) migration: finds call_logs saved with synthetic
 * `platform-{external_profile_id}` contact IDs and repoints them to the
 * real internal alumni_contact UUID (looked up via platform_user_id).
 *
 * Background: The Connects Center used to encounter alumni who had signed up
 * on the external platform but hadn't been matched to an internal alumni_contact
 * yet. Those contacts were rendered with id = `platform-{profile.id}` and any
 * call logs saved against them used that synthetic ID. Later, when the webhook
 * or backfill matched the same person to an internal alumni_contact, they started
 * appearing in the UI under their real UUID — making the old call logs invisible.
 *
 * This endpoint resolves the orphan by:
 *   1. Fetching all call_logs where contact_id starts with 'platform-'
 *   2. Stripping the prefix to get the external platform profile ID
 *   3. Finding the alumni_contact with platform_user_id = that external ID
 *   4. Updating call_logs.contact_id to the real internal UUID
 *
 * Body: { dry_run?: boolean }
 * Returns: { total_platform_logs, migrated, not_found, errors }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  let dry_run = false;
  try {
    const body = await request.json();
    dry_run = body.dry_run ?? false;
  } catch { /* no body is fine */ }

  // Step 1: Fetch all call_logs with platform- contact IDs
  const { data: platformLogs, error: fetchErr } = await db
    .from('call_logs')
    .select('id, contact_id, chapter_id, status, called_at')
    .like('contact_id', 'platform-%');

  if (fetchErr) {
    return NextResponse.json({ error: `Fetch failed: ${fetchErr.message}` }, { status: 500 });
  }

  if (!platformLogs || platformLogs.length === 0) {
    return NextResponse.json({ ok: true, total_platform_logs: 0, migrated: 0, not_found: 0 });
  }

  // Step 2: Extract external profile IDs and build lookup
  const externalIds = platformLogs.map(log => (log.contact_id as string).replace(/^platform-/, ''));

  // Fetch all alumni_contacts that have a matching platform_user_id
  // Supabase .in() filter — batch lookup
  const { data: matchedContacts, error: lookupErr } = await db
    .from('alumni_contacts')
    .select('id, platform_user_id')
    .in('platform_user_id', externalIds);

  if (lookupErr) {
    return NextResponse.json({ error: `Lookup failed: ${lookupErr.message}` }, { status: 500 });
  }

  // Build map: external_profile_id → internal contact UUID
  const externalToInternal = new Map<string, string>();
  for (const contact of (matchedContacts || [])) {
    if (contact.platform_user_id) {
      externalToInternal.set(contact.platform_user_id, contact.id);
    }
  }

  const results = {
    ok: true,
    dry_run,
    total_platform_logs: platformLogs.length,
    migrated: 0,
    not_found: 0,
    errors: [] as { log_id: string; error: string }[],
    not_found_ids: [] as string[],
  };

  // Step 3: Update each log to its real internal UUID
  for (const log of platformLogs) {
    const externalId = (log.contact_id as string).replace(/^platform-/, '');
    const internalId = externalToInternal.get(externalId);

    if (!internalId) {
      results.not_found++;
      results.not_found_ids.push(log.contact_id as string);
      continue;
    }

    if (dry_run) {
      results.migrated++;
      continue;
    }

    // Update contact_id to real internal UUID
    // Note: contact_id has a unique constraint so we need to handle the case
    // where a log for the internal UUID already exists (keep the real one, delete platform- one)
    const { data: existingLog } = await db
      .from('call_logs')
      .select('id, called_at')
      .eq('contact_id', internalId)
      .single();

    if (existingLog) {
      // A real-UUID log already exists — delete the orphan platform- log
      // (keep whichever is more recent)
      const keepPlatform = log.called_at > existingLog.called_at;
      if (keepPlatform) {
        // Update real log with platform- log's data, then delete platform- log
        const { data: platformFull } = await db
          .from('call_logs')
          .select('*')
          .eq('id', log.id)
          .single();

        if (platformFull) {
          await db.from('call_logs')
            .update({
              status: platformFull.status,
              notes: platformFull.notes,
              tags: platformFull.tags,
              called_by: platformFull.called_by,
              called_at: platformFull.called_at,
              follow_up_date: platformFull.follow_up_date,
              follow_up_completed: platformFull.follow_up_completed,
              contact_snapshot: platformFull.contact_snapshot,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLog.id);
        }
      }
      // Delete the platform- log either way
      await db.from('call_logs').delete().eq('id', log.id);
      results.migrated++;
    } else {
      // No conflict — just update contact_id
      const { error: updateErr } = await db
        .from('call_logs')
        .update({ contact_id: internalId, updated_at: new Date().toISOString() })
        .eq('id', log.id);

      if (updateErr) {
        results.errors.push({ log_id: log.id, error: updateErr.message });
      } else {
        results.migrated++;
      }
    }
  }

  return NextResponse.json(results);
}
