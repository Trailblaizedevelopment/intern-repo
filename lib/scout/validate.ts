import { INTRO_CLAIM } from '@/lib/scout/intro-status';

export const MAX_MESSAGE_CHARS = 500;

const INTERNAL_STRINGS = [
  'Already offered',
  'focus_person',
  'Conversation stage',
  'Member name:',
  'Looking for:',
  'Agent mode:',
  'Discovery guidance:',
];

const REASONING_TELLS = [
  /Looking at the/i,
  /^Wait,/m,
  /the system says/i,
  /conversation history/i,
  /Relevant alumni matches/i,
  /tool_use/i,
];

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export interface ValidationAllowlist {
  introducibleNames: string[];
  inboundNames: string[];
  rejectedNames: string[];
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

function normalizeNameToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

function nameTokens(names: string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    for (const part of n.split(/\s+/)) {
      const t = normalizeNameToken(part);
      if (t.length >= 3) out.add(t);
    }
  }
  return out;
}

/** Capitalized tokens that look like person names (skip sentence starts poorly — require 2+ parts or known allowlist hit). */
export function extractProperNames(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
  const firsts = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  return [...matches, ...firsts];
}

export function validateOutbound(
  message: string,
  allow: ValidationAllowlist,
  lastOutbound?: string | null
): ValidationResult {
  const reasons: string[] = [];
  if (!message || !message.trim()) {
    return { ok: false, reasons: ['empty'] };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    reasons.push('too_long');
  }
  for (const s of INTERNAL_STRINGS) {
    if (message.includes(s)) reasons.push(`internal:${s}`);
  }
  if (/\btier\b/i.test(message)) reasons.push('internal:tier');
  if (UUID_RE.test(message)) reasons.push('uuid_leak');
  for (const re of REASONING_TELLS) {
    if (re.test(message)) reasons.push(`reasoning:${re.source}`);
  }
  if (INTRO_CLAIM.test(message)) reasons.push('intro_claim');

  const inboundAllowed = nameTokens(allow.inboundNames);
  const allowed = nameTokens([...allow.introducibleNames, ...allow.inboundNames]);
  const rejected = nameTokens(allow.rejectedNames);
  const mentioned = extractProperNames(message);
  const skip = new Set([
    'scout', 'i', 'i\'m', 'hey', 'got', 'the', 'this', 'that', 'phi', 'delt',
    'ole', 'miss', 'texas', 'atlanta', 'dallas', 'houston', 'austin',
  ]);
  for (const m of mentioned) {
    const tok = normalizeNameToken(m.split(/\s+/)[0] || m);
    if (tok.length < 3 || skip.has(tok)) continue;
    if (rejected.has(tok) && !inboundAllowed.has(tok)) {
      reasons.push(`rejected_name:${m}`);
      continue;
    }
    const parts = m.split(/\s+/).map(normalizeNameToken).filter(t => t.length >= 3);
    const anyAllowed = parts.some(p => allowed.has(p));
    if (!anyAllowed && parts.length >= 2) {
      reasons.push(`unnamed_person:${m}`);
    }
  }

  if (lastOutbound) {
    const a = message.trim().slice(0, 24).toLowerCase();
    const b = lastOutbound.trim().slice(0, 24).toLowerCase();
    if (a.length >= 12 && a === b) reasons.push('repeat_opening');
    const near = message.trim().toLowerCase();
    const prev = lastOutbound.trim().toLowerCase();
    if (near === prev) reasons.push('duplicate_outbound');
  }

  return { ok: reasons.length === 0, reasons };
}
