export interface TieFeatures {
  same_chapter: boolean;
  year_overlap: boolean;
  accepted_intro: boolean;
  recency_days: number | null;
  independent_source_count: number;
}

const SOURCE_COST: Record<string, number> = {
  accepted_intro: 8,
  chapter_overlap: 5,
  explicit_connection: 6,
  event_coattendance: 5,
  conversation: 1,
};

/**
 * Cost-weighted strength. Two weak sources do not equal one strong one.
 * Recency decay after 180 days.
 */
export function computeTieStrength(
  features: TieFeatures,
  tieSources: string[]
): number {
  let score = 0;
  const unique = [...new Set(tieSources)];
  const costs = unique.map(s => SOURCE_COST[s] ?? 1).sort((a, b) => b - a);
  if (costs[0]) score += costs[0];
  if (costs[1]) score += costs[1] * 0.35;
  if (features.year_overlap && features.same_chapter) score += 3;
  if (features.accepted_intro) score += 4;
  if (features.independent_source_count >= 2 && costs[0] >= 5) score += 1.5;

  if (features.recency_days != null) {
    if (features.recency_days > 180) {
      const extra = Math.min(1, (features.recency_days - 180) / 720);
      score *= 1 - extra * 0.6;
    }
  }

  return Math.round(score * 10) / 10;
}
