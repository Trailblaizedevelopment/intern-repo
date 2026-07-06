/** Short in-thread acks (1–4 words) before the agent reply replaces the message. */
const ACK_PHRASES = [
  'got it bro',
  'looking into that',
  'yeah for sure',
  'hang tight',
  'on it',
  'one sec',
  'bet, checking',
  'got you',
  'say less',
  'fs hold up',
  'copy that',
  'checking now',
] as const;

export function pickSlackAckPhrase(): string {
  const i = Math.floor(Math.random() * ACK_PHRASES.length);
  return ACK_PHRASES[i] ?? 'on it';
}
