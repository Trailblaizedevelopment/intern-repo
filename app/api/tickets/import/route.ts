import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

const STATUS_MAP: Record<string, string> = {
  'Backlog': 'backlog',
  'Todo': 'todo',
  'In Progress': 'in_progress',
  'In Review': 'in_review',
  'Done': 'done',
  'Canceled': 'canceled',
};

const PRIORITY_MAP: Record<string, string> = {
  'Urgent': 'critical',
  'High': 'high',
  'Medium': 'medium',
  'Low': 'low',
  'No priority': 'none',
};

const LABEL_TO_TYPE: Record<string, string> = {
  'Bug': 'bug',
  'Critical': 'bug',
  'Feature': 'feature_request',
  'Enhancement': 'improvement',
  'Technical Debt': 'improvement',
};

/**
 * Parse Linear date format: "Thu Oct 23 2025 14:05:25 GMT+0000 (GMT)"
 * Strips the parenthesized timezone name before parsing.
 */
function parseLinearDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  try {
    let clean = dateStr.trim();
    if (clean.includes('(')) {
      clean = clean.substring(0, clean.indexOf('(')).trim();
    }
    const dt = new Date(clean);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

/**
 * Parse CSV with proper handling of:
 * - Quoted fields containing commas
 * - Quoted fields containing newlines
 * - Escaped quotes ("") inside quoted fields
 * - Regular unquoted fields
 */
function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let firstRowComplete = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        currentField = '';

        if (!firstRowComplete) {
          headers = currentRow.map(h => h.trim());
          firstRowComplete = true;
        } else if (currentRow.length === headers.length) {
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => {
            obj[h] = currentRow[idx] ?? '';
          });
          rows.push(obj);
        }
        currentRow = [];

        if (ch === '\r' && next === '\n') i++;
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (firstRowComplete && currentRow.length === headers.length) {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = currentRow[idx] ?? '';
      });
      rows.push(obj);
    }
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const execute = searchParams.get('execute') === 'true';

    let csvText: string;
    try {
      const csvPath = join(process.cwd(), 'data', 'linear_tickets.csv');
      csvText = readFileSync(csvPath, 'utf-8');
    } catch {
      return NextResponse.json({
        error: 'CSV file not found at data/linear_tickets.csv',
        hint: 'Place the Linear export CSV at <project-root>/data/linear_tickets.csv',
      }, { status: 404 });
    }

    const csvRows = parseCSV(csvText);

    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, email');

    const employeeLookup: Record<string, string> = {};
    (employees || []).forEach((emp: { id: string; email: string }) => {
      if (emp.email) employeeLookup[emp.email.toLowerCase()] = emp.id;
    });

    const tickets: Record<string, unknown>[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const errors: string[] = [];

    for (const row of csvRows) {
      const externalId = (row['ID'] ?? '').trim();
      const title = (row['Title'] ?? '').trim();
      if (!externalId || !title) {
        skipped.push({ id: externalId || '?', reason: 'Missing ID or title' });
        continue;
      }

      const rawStatus = (row['Status'] ?? '').trim();
      const status = STATUS_MAP[rawStatus];
      if (!status) {
        skipped.push({ id: externalId, reason: `Unknown status: ${rawStatus}` });
        continue;
      }

      const rawPriority = (row['Priority'] ?? '').trim();
      const priority = PRIORITY_MAP[rawPriority] ?? 'none';

      const rawLabels = (row['Labels'] ?? '').trim();
      const labels = rawLabels ? rawLabels.split(',').map(l => l.trim()).filter(Boolean) : [];

      let ticketType = 'issue';
      for (const label of labels) {
        if (LABEL_TO_TYPE[label]) {
          ticketType = LABEL_TO_TYPE[label];
          break;
        }
      }

      const description = (row['Description'] ?? '').trim() || null;
      const project = (row['Project'] ?? '').trim() || null;

      const creatorEmail = (row['Creator'] ?? '').trim().toLowerCase();
      const assigneeEmail = (row['Assignee'] ?? '').trim().toLowerCase();
      const creatorId = employeeLookup[creatorEmail] ?? null;
      const assigneeId = employeeLookup[assigneeEmail] ?? null;

      let storyPoints: number | null = null;
      const rawEstimate = (row['Estimate'] ?? '').trim();
      if (rawEstimate) {
        const parsed = parseFloat(rawEstimate);
        if (!isNaN(parsed)) storyPoints = Math.round(parsed);
      }

      const createdAt = parseLinearDate(row['Created'] ?? '');
      const updatedAt = parseLinearDate(row['Updated'] ?? '');
      const dueDate = parseLinearDate(row['Due Date'] ?? '');
      let resolvedAt: string | null = null;
      if (status === 'done') resolvedAt = parseLinearDate(row['Completed'] ?? '');
      if (status === 'canceled') resolvedAt = parseLinearDate(row['Canceled'] ?? '');

      const ticket: Record<string, unknown> = {
        external_id: externalId,
        title,
        description,
        type: ticketType,
        priority,
        status,
        creator_id: creatorId,
        assignee_id: assigneeId,
        labels,
        project,
        story_points: storyPoints,
        due_date: dueDate,
        resolved_at: resolvedAt,
      };
      if (createdAt) ticket.created_at = createdAt;
      if (updatedAt) ticket.updated_at = updatedAt;

      tickets.push(ticket);
    }

    const statusBreakdown: Record<string, number> = {};
    const priorityBreakdown: Record<string, number> = {};
    tickets.forEach(t => {
      const s = t.status as string;
      const p = t.priority as string;
      statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1;
      priorityBreakdown[p] = (priorityBreakdown[p] ?? 0) + 1;
    });

    if (!execute) {
      return NextResponse.json({
        mode: 'DRY RUN',
        totalCsvRows: csvRows.length,
        ticketsMapped: tickets.length,
        skipped,
        errors,
        statusBreakdown,
        priorityBreakdown,
        hint: 'Add ?execute=true to actually import',
      });
    }

    const BATCH_SIZE = 50;
    let imported = 0;

    for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
      const batch = tickets.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('tickets')
        .upsert(batch, { onConflict: 'external_id' })
        .select('id');

      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        imported += (data ?? []).length;
      }
    }

    return NextResponse.json({
      mode: 'EXECUTED',
      totalCsvRows: csvRows.length,
      ticketsMapped: tickets.length,
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      statusBreakdown,
      priorityBreakdown,
    });
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json({ error: 'Import failed', details: String(err) }, { status: 500 });
  }
}
