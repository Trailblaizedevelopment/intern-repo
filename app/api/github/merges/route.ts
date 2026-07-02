import { NextResponse } from 'next/server';
import { fetchGitHubMergesSummary } from '@/lib/github-merges';

export async function GET() {
  try {
    const summary = await fetchGitHubMergesSummary();
    return NextResponse.json({ data: summary, error: null });
  } catch (err) {
    console.error('GitHub merges fetch error:', err);
    return NextResponse.json(
      {
        data: null,
        error: { message: err instanceof Error ? err.message : 'Failed to fetch GitHub merges', code: 'GITHUB_FETCH_FAILED' },
      },
      { status: 500 }
    );
  }
}
