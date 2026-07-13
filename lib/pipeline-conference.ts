const CONFERENCE_CANONICAL: Record<string, string> = {
  'sec': 'SEC',
  'acc': 'ACC',
  'aac': 'AAC',
  'big 12': 'Big 12',
  'big12': 'Big 12',
  'big ten': 'Big Ten',
  'big 10': 'Big Ten',
  'bigten': 'Big Ten',
  'pac-12': 'Pac-12',
  'pac 12': 'Pac-12',
  'pac12': 'Pac-12',
  'mountain west': 'Mountain West',
  'sun belt': 'Sun Belt',
  'sunbelt': 'Sun Belt',
  'conference usa': 'Conference USA',
  'c-usa': 'Conference USA',
  'cusa': 'Conference USA',
  'american athletic': 'AAC',
  'american': 'AAC',
  'non-sec': 'Non-SEC',
  'non sec': 'Non-SEC',
};

export function normalizeConference(name: string | null | undefined): string {
  if (!name?.trim()) return 'Unknown';
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  return CONFERENCE_CANONICAL[key] ?? trimmed;
}

export function getDealConference(deal: {
  conference?: string | null;
  organization?: { school?: { conference?: string | null } | null } | null;
}): string {
  const raw =
    deal.organization?.school?.conference ||
    deal.conference ||
    'Unknown';
  return normalizeConference(raw);
}
