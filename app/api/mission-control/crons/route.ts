import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const CRON_STORE_PATH = path.join(
  process.env.HOME ?? '/Users/jarvis',
  '.openclaw',
  'cron',
  'jobs.json'
);

export async function GET() {
  try {
    const raw = await readFile(CRON_STORE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    return NextResponse.json(
      { jobs, total: jobs.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { jobs: [], total: 0, error: `Failed to read cron store: ${msg}` },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
