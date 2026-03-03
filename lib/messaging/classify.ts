/**
 * Response classification logic.
 * Determines alumni intent from their reply text.
 */

export type ResponseClassification =
  | 'confirmed'
  | 'wrong_number'
  | 'question'
  | 'declined'
  | 'signed_up'
  | 'no_response';

export interface ClassificationResult {
  classification: ResponseClassification;
  needs_human_review: boolean;
  reason?: string;
}

const WRONG_NUMBER_PATTERNS = /\b(wrong|not me|not him|not her|mother|father|dad|mom|deceased|passed|died|no longer|don't know|dont know)\b/i;
const DECLINED_PATTERNS = /\b(stop|unsubscribe|remove|not interested|no thanks|don't text|dont text|leave me alone|opt out|take me off)\b/i;
const CONFIRMED_PATTERNS = /\b(yes|yeah|yep|yea|this is|correct|that's me|thats me|sure|speaking|hey|what's up|sup)\b/i;
const SIGNED_UP_PATTERNS = /\b(signed up|joined|registered|created|done|got it set up|just signed|i'm in|im in)\b/i;

const HUMAN_REVIEW_PATTERNS = /\b(lawyer|legal|report|harassment|money|pay|hire|job|intern|business|homeless|help)\b/i;

export function classifyResponse(text: string): ClassificationResult {
  const trimmed = text.trim();
  if (!trimmed) return { classification: 'no_response', needs_human_review: false };

  const needsReview = trimmed.length > 100 || HUMAN_REVIEW_PATTERNS.test(trimmed);

  // Order matters — check negative signals first
  if (WRONG_NUMBER_PATTERNS.test(trimmed)) {
    return { classification: 'wrong_number', needs_human_review: needsReview };
  }
  if (DECLINED_PATTERNS.test(trimmed)) {
    return { classification: 'declined', needs_human_review: needsReview };
  }
  if (SIGNED_UP_PATTERNS.test(trimmed)) {
    return { classification: 'signed_up', needs_human_review: needsReview };
  }
  if (CONFIRMED_PATTERNS.test(trimmed)) {
    return { classification: 'confirmed', needs_human_review: needsReview };
  }
  if (trimmed.includes('?')) {
    return { classification: 'question', needs_human_review: true, reason: 'Contains question' };
  }

  // Default to confirmed for short affirmative-looking responses
  return { classification: 'confirmed', needs_human_review: needsReview || trimmed.length > 50 };
}

/**
 * Substitute template variables.
 * Variables: {first_name}, {last_name}, {sender_name}, {school}, {fraternity}, {signup_link}
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value || '');
  }
  // Clean up any remaining unreplaced variables
  result = result.replace(/\{[a-z_]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
  return result;
}
