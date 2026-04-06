import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// POST /api/mission-control/crons/[id]/run — trigger a cron job immediately via CLI
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(
      `/opt/homebrew/bin/openclaw cron run ${id}`,
      { timeout: 20_000 }
    );

    return NextResponse.json({
      ok: true,
      output: (stdout + stderr).trim() || 'Job triggered.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const output =
      (err as { stderr?: string; stdout?: string }).stderr ??
      (err as { stdout?: string }).stdout ??
      msg;
    return NextResponse.json({ ok: false, error: output }, { status: 500 });
  }
}
