export const INTRO_CLAIM =
  /\b(already (texted|messaged|reached out|sent)|i (texted|messaged|reached out|contacted)|intro is (in|done|sent)|i made the intro|outreach (is )?done)\b/i;

export function introStatusLine(row: {
  status: string;
  platform_target_snapshot?: { name?: string } | null;
}): string {
  const name =
    row.platform_target_snapshot && typeof row.platform_target_snapshot.name === 'string'
      ? row.platform_target_snapshot.name
      : 'that person';
  switch (row.status) {
    case 'suggested':
      return `Intro to ${name} is queued for the team to review — nothing has been sent yet.`;
    case 'pending_approval':
      return `Intro to ${name} is waiting on team approval — nobody has been texted yet.`;
    case 'sent':
      return `The team has the ${name} intro — they have not been auto-texted. A teammate reaches out.`;
    case 'accepted':
      return `Intro to ${name} was accepted.`;
    case 'declined':
      return `Intro to ${name} was declined.`;
    default:
      return `Intro to ${name} is on file (status: ${row.status}).`;
  }
}
