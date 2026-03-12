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

/**
 * Patterns that require a human to review before any further automated send.
 * Covers: call/phone requests, wrong number/identity confusion, deceased/sensitive,
 * anger/legal threats, and opt-out/confusion signals.
 */
const HUMAN_REVIEW_PATTERNS = new RegExp(
  [
    // Call / phone requests
    'call me', 'call you', 'give me a call', 'phone number', 'reach me', 'contact me',
    // Wrong number / identity confusion
    'wrong number', 'wrong person', 'not me', 'not him', 'not her',
    'who is this', 'who are you', 'how did you get my number', 'how did you get this',
    // Deceased / sensitive
    'passed away', 'no longer with us', 'he died', 'she died',
    'my husband', 'my wife', 'my son', 'my daughter', 'my father', 'my mother',
    // Anger / legal
    'stop texting', 'stop contacting', 'leave me alone', 'report you',
    'harassment', 'sue', 'block',
    // Single-word high-signal terms (word-boundary wrapped separately)
    '\\blawyer\\b', '\\blegal\\b', '\\bspam\\b', '\\bdeceased\\b', '\\bpassed\\b',
    // Opt-out / confusion
    'what is this', 'what is trailblaize', 'remove me', 'unsubscribe', 'opt out',
    // Legacy patterns
    '\\bmoney\\b', '\\bpay\\b', '\\bhire\\b', '\\bjob\\b', '\\bintern\\b',
    '\\bbusiness\\b', '\\bhomeless\\b', '\\bhelp\\b',
  ].join('|'),
  'i'
);

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
