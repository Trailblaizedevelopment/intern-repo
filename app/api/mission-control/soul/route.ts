import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME ?? '/Users/jarvis';

const SOUL_PATHS: Record<string, string> = {
  tony: path.join(HOME, '.openclaw', 'workspace', 'SOUL.md'),
  main: path.join(HOME, '.openclaw', 'workspace', 'SOUL.md'),
  gtm: path.join(HOME, '.openclaw', 'workspace-gtm', 'SOUL.md'),
  sales: path.join(HOME, '.openclaw', 'agents', 'sales', 'agent', 'SOUL.md'),
  alumni: path.join(HOME, '.openclaw', 'agents', 'alumni', 'agent', 'SOUL.md'),
  cs: path.join(HOME, '.openclaw', 'agents', 'cs', 'agent', 'SOUL.md'),
  product: path.join(HOME, '.openclaw', 'agents', 'product', 'agent', 'SOUL.md'),
  dev: path.join(HOME, '.openclaw', 'agents', 'dev', 'agent', 'SOUL.md'),
  forge: path.join(HOME, '.openclaw', 'agents', 'dev', 'agent', 'SOUL.md'),
  success: path.join(HOME, '.openclaw', 'workspace-success', 'SOUL.md'),
  ui: path.join(HOME, '.openclaw', 'workspace-ui', 'SOUL.md'),
  backend: path.join(HOME, '.openclaw', 'workspace-backend', 'SOUL.md'),
  qa: path.join(HOME, '.openclaw', 'workspace-qa', 'SOUL.md'),
  architect: path.join(HOME, '.openclaw', 'workspace-architect', 'SOUL.md'),
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get('agent')?.toLowerCase() ?? '';

  const filePath = SOUL_PATHS[agent];
  if (!filePath) {
    return NextResponse.json({ content: '', agent });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ content, agent });
  } catch {
    return NextResponse.json({ content: '', agent });
  }
}
