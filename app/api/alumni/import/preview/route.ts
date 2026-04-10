import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ── Header aliases (extended for real-world fraternity lists) ─────────────────
const HEADER_ALIASES: Record<string, string[]> = {
  full_name: ['name', 'full name', 'fullname', 'member name', 'alumnus', 'alumni name', 'member', 'alumnus name', 'addressee'],
  first_name: [
    'first name', 'fname', 'first', 'firstname', 'given name', 'givenname', 'preferred name', 'preferred', 'forename',
    // Nationals export formats
    'frsname', 'frs name', 'frs', 'nckname', 'nick name', 'nickname', 'first nm', 'firstnm',
  ],
  last_name: [
    'last name', 'lname', 'last', 'lastname', 'surname', 'family name', 'familyname', 'family', 'surname',
    // Nationals export formats
    'lstname', 'lst name', 'lst', 'last nm', 'lastnm',
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'cell', 'cell phone', 'cellphone', 'mobile', 'telephone', 'tel',
    'cell phone number', 'mobile number', 'contact number', 'direct', 'phone #', 'number',
    // Nationals export formats
    'home phone', 'homephone', 'busn cell', 'busncell', 'personal cell',
  ],
  phone_primary: ['phone 1', 'phone1', 'primary phone', 'primary', 'cell 1', 'cell1', 'mobile 1', 'phone primary'],
  phone_secondary: [
    'phone 2', 'phone2', 'secondary phone', 'secondary', 'cell 2', 'cell2', 'mobile 2', 'phone secondary',
    'alt phone', 'alternate phone', 'other phone', 'imessage', 'imessage number',
  ],
  email: [
    'email', 'email address', 'emailaddress', 'e-mail', 'mail', 'email 1', 'primary email', 'contact email',
    // Nationals export formats
    'busn email', 'busnemail', 'personal email',
  ],
  year: [
    'year', 'grad year', 'graduation year', 'class year', 'class', 'initiation year', 'init year', 'grad', 'graduation',
    'class of', 'pledge year', 'initiated', 'year initiated',
    // Nationals export formats — "Init. Ceremony" contains initiation year (e.g. "Fall 1995")
    'init. ceremony', 'init ceremony', 'initceremony', 'cand. ceremony', 'cand ceremony',
    'initiation date', 'init date', 'pledge date', 'init year', 'graduation', 'grad date',
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
  if (digits.length === 20) return [digits.slice(0, 10), digits.slice(10)];
  if (digits.length === 21 && digits.startsWith('1')) return [digits.slice(0, 11), digits.slice(11)];
  if (digits.length === 22 && digits.startsWith('1')) return [digits.slice(0, 11), digits.slice(11)];
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface DetectedColumn {
  raw_header: string;
  mapped_to: string | null;
}

interface SampleRow {
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  email: string | null;
  year: number | null;
}

interface PreviewCounts {
  total_rows: number;
  will_import: number;
  skip_pre_1970: number;
  skip_no_name: number;
  skip_invalid_phone: number;
  duplicates: number;
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected' } },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chapterId = formData.get('chapter_id') as string | null;

    if (!file || !chapterId) {
      return NextResponse.json(
        { data: null, error: { message: 'file and chapter_id are required' } },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { data: null, error: { message: 'CSV must contain a header row and at least one data row' } },
        { status: 400 }
      );
    }

    // ── Build column map ──────────────────────────────────────────────────────
    const headerRow = rows[0];
    const columnMap: Record<number, string> = {};
    const detected_columns: DetectedColumn[] = [];
    const unmapped_headers: string[] = [];

    for (let i = 0; i < headerRow.length; i++) {
      const raw = headerRow[i];
      const field = matchHeader(raw);
      detected_columns.push({ raw_header: raw, mapped_to: field });
      if (field) {
        columnMap[i] = field;
      } else if (raw.trim()) {
        unmapped_headers.push(raw);
      }
    }

    const mappedFields = Object.values(columnMap);

    // Full name handling: if no first_name/last_name but full_name exists, note it
    const hasFullName = mappedFields.includes('full_name');
    const hasFirstName = mappedFields.includes('first_name') || hasFullName;
    const hasLastName = mappedFields.includes('last_name') || hasFullName;
    const hasYearCol = mappedFields.includes('year');
    const hasPhoneCol = mappedFields.includes('phone') || mappedFields.includes('phone_primary') || mappedFields.includes('phone_secondary');

    const has_required_fields = hasFirstName && hasLastName;

    // ── Fetch existing phones for duplicate check ─────────────────────────────
    const { data: existing } = await supabase
      .from('alumni_contacts')
      .select('phone_primary')
      .eq('chapter_id', chapterId)
      .not('phone_primary', 'is', null);

    const existingPhones = new Set((existing || []).map((c: { phone_primary: string }) => c.phone_primary));

    // ── Process rows ──────────────────────────────────────────────────────────
    const counts: PreviewCounts = {
      total_rows: rows.length - 1,
      will_import: 0,
      skip_pre_1970: 0,
      skip_no_name: 0,
      skip_invalid_phone: 0,
      duplicates: 0,
    };

    const sample_rows: SampleRow[] = [];
    const seenPhones = new Set<string>();
    let noPhoneCount = 0;

    const hasSeparatePrimaryCols = mappedFields.includes('phone_primary') || mappedFields.includes('phone_secondary');
    const hasSinglePhoneCol = mappedFields.includes('phone');

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const record: Record<string, string> = {};
      for (const [colIdx, field] of Object.entries(columnMap)) {
        record[field] = row[parseInt(colIdx)] || '';
      }

      // ── Name resolution ───────────────────────────────────────────────────
      let firstName = record.first_name?.trim() || '';
      let lastName = record.last_name?.trim() || '';

      if ((!firstName || !lastName) && hasFullName) {
        const fullName = record.full_name?.trim() || '';
        if (fullName) {
          const spaceIdx = fullName.lastIndexOf(' ');
          if (spaceIdx > 0) {
            firstName = fullName.slice(0, spaceIdx).trim();
            lastName = fullName.slice(spaceIdx + 1).trim();
          } else {
            firstName = fullName;
            lastName = '';
          }
        }
      }

      if (!firstName || !lastName) {
        counts.skip_no_name++;
        continue;
      }

      // ── Year filter ───────────────────────────────────────────────────────
      const rawYear = record.year?.trim() || '';
      // Handle formats like "Fall 1995", "Spring 2003", "1995-2000", "05/1995" etc.
      // Extract the 4-digit year from anywhere in the string
      const yearMatch = rawYear.match(/\b(19[7-9]\d|20[0-2]\d)\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : (rawYear ? parseInt(rawYear) : null);
      const validYear = year && year > 1900 && year < 2100 ? year : null;

      if (hasYearCol && year !== null && year < 1970) {
        counts.skip_pre_1970++;
        continue;
      }

      // ── Phone normalization ───────────────────────────────────────────────
      let phonePrimary: string | null = null;
      let phoneInvalid = false;

      if (hasSeparatePrimaryCols) {
        const rawP1 = record.phone_primary?.trim() || record.phone?.trim() || '';
        if (rawP1) {
          phonePrimary = normalizePhone(rawP1);
          if (!phonePrimary) phoneInvalid = true;
        }
      } else if (hasSinglePhoneCol) {
        const rawPhone = record.phone?.trim() || '';
        if (rawPhone) {
          const parts = splitMultiPhone(rawPhone);
          phonePrimary = normalizePhone(parts[0]);
          if (!phonePrimary) phoneInvalid = true;
        }
      }

      if (phoneInvalid && hasPhoneCol) {
        counts.skip_invalid_phone++;
        continue;
      }

      if (!phonePrimary) {
        noPhoneCount++;
      }

      // ── Duplicate check ───────────────────────────────────────────────────
      if (phonePrimary) {
        if (existingPhones.has(phonePrimary) || seenPhones.has(phonePrimary)) {
          counts.duplicates++;
          continue;
        }
        seenPhones.add(phonePrimary);
      }

      // ── Will import ───────────────────────────────────────────────────────
      counts.will_import++;

      // Collect sample rows (first 3 valid)
      if (sample_rows.length < 3) {
        const rawEmail = record.email?.trim() || null;
        sample_rows.push({
          first_name: firstName,
          last_name: lastName,
          phone_primary: phonePrimary,
          email: rawEmail || null,
          year: validYear,
        });
      }
    }

    // ── Warnings ──────────────────────────────────────────────────────────────
    const warnings: string[] = [];
    if (!hasYearCol) {
      warnings.push('No year column found — all contacts will be imported regardless of graduation year');
    }
    if (!hasPhoneCol) {
      warnings.push('No phone column found — contacts will be imported without phone numbers');
    } else if (noPhoneCount > 0) {
      warnings.push(`${noPhoneCount} contact${noPhoneCount === 1 ? '' : 's'} have no phone number — they'll be imported but can't be texted`);
    }
    if (!has_required_fields) {
      warnings.push('CSV is missing required columns: first_name and last_name (or a full name column)');
    }

    return NextResponse.json({
      data: {
        detected_columns,
        sample_rows,
        counts,
        warnings,
        unmapped_headers,
        has_required_fields,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error generating import preview:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to generate preview' } },
      { status: 500 }
    );
  }
}
