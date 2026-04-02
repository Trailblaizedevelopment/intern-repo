import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { autoAssignQueue } from '@/lib/outreach';
import { batchLookupPhoneTypes } from '@/lib/telnyx';

const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['name', 'full name', 'fullname', 'member name', 'alumnus', 'alumni name', 'member', 'alumnus name', 'addressee'],
  first_name: [
    'first name', 'fname', 'first', 'firstname', 'given name', 'givenname', 'preferred name', 'preferred', 'forename',
    'frsname', 'frs name', 'frs', 'nckname', 'nick name', 'nickname', 'first nm', 'firstnm',
  ],
  last_name: [
    'last name', 'lname', 'last', 'lastname', 'surname', 'family name', 'familyname', 'family',
    'lstname', 'lst name', 'lst', 'last nm', 'lastnm',
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'cell', 'cell phone', 'cellphone', 'mobile', 'telephone', 'tel',
    'cell phone number', 'mobile number', 'contact number', 'direct', 'phone #', 'number',
    'home phone', 'homephone', 'busn cell', 'busncell', 'personal cell',
  ],
  phone_primary: ['phone 1', 'phone1', 'primary phone', 'primary', 'cell 1', 'cell1', 'mobile 1', 'phone primary'],
  phone_secondary: ['phone 2', 'phone2', 'secondary phone', 'secondary', 'cell 2', 'cell2', 'mobile 2', 'phone secondary', 'alt phone', 'alternate phone', 'other phone', 'imessage', 'imessage number'],
  email: [
    'email', 'email address', 'emailaddress', 'e-mail', 'mail', 'email 1', 'primary email', 'contact email',
    'busn email', 'busnemail', 'personal email',
  ],
  year: [
    'year', 'grad year', 'graduation year', 'class year', 'class', 'initiation year', 'init year', 'grad', 'graduation',
    'class of', 'pledge year', 'initiated', 'year initiated',
    'init. ceremony', 'init ceremony', 'initceremony', 'cand. ceremony', 'cand ceremony',
    'initiation date', 'init date', 'pledge date', 'graduation', 'grad date',
  ],
};

function matchHeader(raw: string): string | null {
  const normalized = raw.trim().toLowerCase().replace(/[_\-]/g, ' ');
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized) || normalized === field.replace(/_/g, ' ')) {
      return field;
    }
  }
  return null;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function splitMultiPhone(raw: string): string[] {
  const parts = raw.split(/[,;\/|]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length > 1) return parts;

  const digits = raw.replace(/\D/g, '');
  if (digits.length === 20) {
    return [digits.slice(0, 10), digits.slice(10)];
  }
  if (digits.length === 21 && digits.startsWith('1')) {
    return [digits.slice(0, 11), digits.slice(11)];
  }
  if (digits.length === 22 && digits.startsWith('1')) {
    return [digits.slice(0, 11), digits.slice(11)];
  }
  return [raw];
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(cell => cell !== '')) rows.push(row);
        row = []; current = '';
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(cell => cell !== '')) rows.push(row);
  return rows;
}

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chapterId = formData.get('chapter_id') as string | null;

    if (!file || !chapterId) {
      return NextResponse.json(
        { data: null, error: { message: 'file and chapter_id are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { data: null, error: { message: 'CSV must contain a header row and at least one data row', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const headerRow = rows[0];
    const columnMap: Record<number, string> = {};
    for (let i = 0; i < headerRow.length; i++) {
      const field = matchHeader(headerRow[i]);
      if (field) columnMap[i] = field;
    }

    const hasFirstName = Object.values(columnMap).includes('first_name');
    const hasLastName = Object.values(columnMap).includes('last_name');
    if (!hasFirstName || !hasLastName) {
      return NextResponse.json(
        { data: null, error: { message: 'CSV must contain first_name and last_name columns', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const hasSeparatePhoneCols = Object.values(columnMap).includes('phone_primary') || Object.values(columnMap).includes('phone_secondary');
    const hasSinglePhoneCol = Object.values(columnMap).includes('phone');

    const { data: existing } = await supabase
      .from('alumni_contacts')
      .select('phone_primary')
      .eq('chapter_id', chapterId)
      .not('phone_primary', 'is', null);

    const existingPhones = new Set((existing || []).map(c => c.phone_primary));

    type InsertRow = { chapter_id: string; first_name: string; last_name: string; phone_primary: string | null; phone_secondary: string | null; email: string | null; year: number | null };
    const toInsert: InsertRow[] = [];
    const errors: { row: number; message: string }[] = [];
    const warnings: { row: number; message: string }[] = [];
    let skipped = 0;
    let duplicates = 0;
    let dualPhoneCount = 0;
    let missingYearCount = 0;
    const seenPhones = new Set<string>();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const record: Record<string, string> = {};
      for (const [colIdx, field] of Object.entries(columnMap)) {
        record[field] = row[parseInt(colIdx)] || '';
      }

      let firstName = record.first_name?.trim() || '';
      let lastName = record.last_name?.trim() || '';

      // Handle full_name column — split on last space
      if ((!firstName || !lastName) && record.full_name?.trim()) {
        const parts = record.full_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          firstName = parts.slice(0, -1).join(' ');
          lastName = parts[parts.length - 1];
        } else {
          firstName = parts[0];
          lastName = '';
        }
      }

      const rawEmail = record.email?.trim() || '';
      const rawYear = record.year?.trim() || '';

      if (!firstName || !lastName) {
        errors.push({ row: r + 1, message: 'Missing first or last name' });
        skipped++;
        continue;
      }

      let phonePrimary: string | null = null;
      let phoneSecondary: string | null = null;

      if (hasSeparatePhoneCols) {
        const rawP1 = record.phone_primary?.trim() || record.phone?.trim() || '';
        const rawP2 = record.phone_secondary?.trim() || '';
        if (rawP1) phonePrimary = normalizePhone(rawP1);
        if (rawP2) phoneSecondary = normalizePhone(rawP2);
        if (rawP1 && !phonePrimary) {
          errors.push({ row: r + 1, message: `Invalid primary phone: ${rawP1}` });
          skipped++;
          continue;
        }
      } else if (hasSinglePhoneCol) {
        const rawPhone = record.phone?.trim() || '';
        if (rawPhone) {
          const parts = splitMultiPhone(rawPhone);
          if (parts.length >= 2) {
            phonePrimary = normalizePhone(parts[0]);
            phoneSecondary = normalizePhone(parts[1]);
          } else {
            phonePrimary = normalizePhone(parts[0]);
          }
          if (rawPhone && !phonePrimary) {
            errors.push({ row: r + 1, message: `Invalid phone number: ${rawPhone}` });
            skipped++;
            continue;
          }
        }
      }

      if (phonePrimary && phoneSecondary) dualPhoneCount++;

      const email = rawEmail || null;
      // Handle "Fall 1995", "Spring 2003", date formats — extract 4-digit year
      const yearMatch = rawYear.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
      let year: number | null = yearMatch ? parseInt(yearMatch[1]) : (rawYear ? parseInt(rawYear) : null);

      // Reject pre-1970 grads (too old to be reachable via iMessage outreach)
      if (year !== null && year < 1970) {
        errors.push({ row: r + 1, message: `Grad year ${year} is before 1970 — skipped (${firstName} ${lastName})` });
        skipped++;
        continue;
      }

      // Sanitize out-of-range years that slipped through
      if (year !== null && (year <= 1900 || year >= 2100)) {
        year = null;
      }

      // Warn on missing year (not a hard failure)
      if (!rawYear || year === null) {
        missingYearCount++;
        warnings.push({ row: r + 1, message: `Missing graduation year for ${firstName} ${lastName}` });
      }

      if (phonePrimary && existingPhones.has(phonePrimary)) { duplicates++; continue; }
      if (phonePrimary && seenPhones.has(phonePrimary)) { duplicates++; continue; }
      if (phonePrimary) seenPhones.add(phonePrimary);

      toInsert.push({
        chapter_id: chapterId,
        first_name: firstName,
        last_name: lastName,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        year,
      });
    }

    let imported = 0;
    if (toInsert.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        const { error: insertError, count } = await supabase
          .from('alumni_contacts')
          .insert(batch, { count: 'exact' });

        if (insertError) {
          errors.push({ row: 0, message: `Batch insert error: ${insertError.message}` });
        } else {
          imported += count ?? batch.length;
        }
      }
    }

    let queueAssigned = 0;
    if (imported > 0) {
      try {
        const result = await autoAssignQueue(chapterId);
        queueAssigned = result.assigned;
      } catch (assignErr) {
        console.error('Auto-assign after import failed:', assignErr);
      }
    }

    // ── Telnyx carrier lookup (fire-and-forget, runs after response) ──────────
    // Classifies phone numbers as mobile/landline/voip so non-mobile contacts
    // are permanently excluded from iMessage outreach before they ever hit a batch.
    if (imported > 0 && process.env.TELNYX_API_KEY) {
      const phones = toInsert
        .filter(c => c.phone_primary)
        .map(c => c.phone_primary as string);

      // Non-blocking — don't await, let it run in background
      (async () => {
        try {
          const supabaseAdmin = (await import('@/lib/supabase-admin')).getSupabaseAdmin();
          if (!supabaseAdmin) return;

          const typeMap = await batchLookupPhoneTypes(phones, 120); // 120ms between lookups

          // Batch update phone_type for each classified number
          const updates = [...typeMap.entries()].map(([phone, phoneType]) => ({
            phone,
            phoneType,
          }));

          for (const { phone, phoneType } of updates) {
            await supabaseAdmin
              .from('alumni_contacts')
              .update({ phone_type: phoneType })
              .eq('chapter_id', chapterId)
              .eq('phone_primary', phone);
          }

          console.log(`[import] Telnyx lookup complete: ${updates.length} phones classified`);
        } catch (e) {
          console.error('[import] Telnyx lookup failed:', e);
        }
      })();
    }

    return NextResponse.json({
      data: { imported, skipped, duplicates, dual_phone_count: dualPhoneCount, queue_assigned: queueAssigned, missing_year_count: missingYearCount, errors, warnings },
      error: null,
    });
  } catch (err) {
    console.error('Error importing alumni CSV:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to import CSV', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
