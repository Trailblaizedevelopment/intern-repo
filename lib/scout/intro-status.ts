export const INTRO_CLAIM =
  /\b(already (texted|messaged|reached out|sent)|i (texted|messaged|reached out|contacted)|intro is (in|done|sent)|i made the intro|outreach (is )?done)\b/i;

export const LINKEDIN_SEND_CLAIM =
  /\b(i (sent|messaged|connected|requested) (them )?on linkedin|linkedin (connection|message|invite) (is )?(sent|done)|sent (a )?linkedin)\b/i;

export const TRAILBLAIZE_DM_CLAIM =
  /\b(i (sent|messaged) (them )?(a )?(trailblaize|in-app) (dm|message)|trailblaize (dm|message) (is )?(sent|done))\b/i;

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

export function pathwayStatusLine(row: { status: string; name?: string | null }): string {
  const name = row.name || 'that person';
  switch (row.status) {
    case 'drafted':
      return `Draft for ${name} is ready for you to review — nothing has been sent.`;
    case 'member_approved':
      return `You approved the ${name} draft. A teammate will reach out; they have not been auto-texted.`;
    case 'member_edited':
      return `Updated draft for ${name} is queued. Nobody has been auto-texted.`;
    case 'executed':
      return `The ${name} pathway was executed.`;
    case 'declined':
      return `Skipped ${name}.`;
    case 'expired':
      return `The ${name} draft expired.`;
    default:
      return `Pathway for ${name} is on file (${row.status}).`;
  }
}
