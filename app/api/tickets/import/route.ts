import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildTicketRowFromLinearIssue,
  LINEAR_STATUS_NAME_TO_TICKET_STATUS,
  parseLinearDate,
} from '@/lib/linear-ticket-map';

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
      const linearIdentifier = (row['Identifier'] ?? '').trim();
      const title = (row['Title'] ?? '').trim();
      if (!externalId || !title) {
        skipped.push({ id: externalId || '?', reason: 'Missing ID or title' });
        continue;
      }

      const rawStatus = (row['Status'] ?? '').trim();
      if (!LINEAR_STATUS_NAME_TO_TICKET_STATUS[rawStatus]) {
        skipped.push({ id: externalId, reason: `Unknown status: ${rawStatus}` });
        continue;
      }

      const rawLabels = (row['Labels'] ?? '').trim();
      const labels = rawLabels ? rawLabels.split(',').map(l => l.trim()).filter(Boolean) : [];

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
      const completedAt = parseLinearDate(row['Completed'] ?? '');
      const canceledAt = parseLinearDate(row['Canceled'] ?? '');

      const ticket = buildTicketRowFromLinearIssue(
        {
          id: externalId,
          identifier: linearIdentifier || externalId,
          title,
          description,
          priority_label: (row['Priority'] ?? '').trim() || null,
          state_name: rawStatus,
          assignee_email: assigneeEmail || null,
          creator_email: creatorEmail || null,
          project_name: project,
          estimate: storyPoints,
          due_date: dueDate,
          created_at: createdAt,
          updated_at: updatedAt,
          completed_at: completedAt,
          canceled_at: canceledAt,
          label_names: labels,
        },
        {
          assignee_id: assigneeId,
          creator_id: creatorId,
          project,
        }
      );

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
