/** Keys whose values are always redacted in brain_action_log. */
const SENSITIVE_KEY = /^(token|password|secret|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie)$/i;

/** Inline secret patterns (API keys, bearer tokens). */
const VALUE_PATTERNS: RegExp[] = [
  /sk-ant-[a-zA-Z0-9_-]+/g,
  /lin_api_[a-zA-Z0-9]+/g,
  /github_pat_[a-zA-Z0-9_]+/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
];

const MAX_LOG_STRING = 4000;
const MAX_LOG_DEPTH = 8;

function redactString(s: string): string {
  let out = s;
  for (const pattern of VALUE_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  if (out.length > MAX_LOG_STRING) {
    return `${out.slice(0, MAX_LOG_STRING)}…(truncated)`;
  }
  return out;
}

/** Strip secrets and truncate before persisting tool I/O to brain_action_log. */
export function sanitizeForActionLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_LOG_DEPTH) return '[max depth]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForActionLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeForActionLog(val, depth + 1);
    }
    return out;
  }

  return String(value);
}
