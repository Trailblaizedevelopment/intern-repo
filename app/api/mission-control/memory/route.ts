import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const HOME = process.env.HOME ?? '/Users/jarvis';
const MEMORY_DIR = path.join(HOME, '.openclaw', 'workspace', 'memory');
const LONG_TERM_PATH = path.join(HOME, '.openclaw', 'workspace', 'MEMORY.md');

function canReadLocal(): boolean {
  try {
    fs.accessSync(MEMORY_DIR, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // Return long-term memory
  if (type === 'longterm') {
    if (!canReadLocal()) {
      return NextResponse.json({
        content: '',
        message: 'Memory files are only available when running locally.',
      });
    }
    try {
      const content = fs.readFileSync(LONG_TERM_PATH, 'utf-8');
      return NextResponse.json({ content });
    } catch {
      return NextResponse.json({ content: '' });
    }
  }

  // Return daily logs list
  if (!canReadLocal()) {
    return NextResponse.json({
      entries: [],
      message: 'Memory files are only available when running locally.',
    });
  }

  try {
    let files: string[] = [];
    try {
      files = fs.readdirSync(MEMORY_DIR);
    } catch {
      return NextResponse.json({ entries: [] });
    }

    const mdFiles = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 30);

    const entries = mdFiles.map((filename) => {
      const date = filename.replace('.md', '');
      let content = '';
      let preview = '';
      try {
        content = fs.readFileSync(path.join(MEMORY_DIR, filename), 'utf-8');
        preview = content.slice(0, 200).replace(/\n/g, ' ').trim();
      } catch {
        // unreadable
      }
      return { date, filename, preview, content };
    });

    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
