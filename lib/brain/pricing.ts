/**
 * Anthropic model pricing for Brain cost estimates (USD per million tokens).
 * Override defaults via BRAIN_INPUT_COST_PER_MTOK / BRAIN_OUTPUT_COST_PER_MTOK env vars.
 * Rates are approximate — check console.anthropic.com for current billing.
 */

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Sonnet-tier models (claude-sonnet-4-6, 3.5-sonnet, etc.) */
const SONNET: ModelPricing = { inputPerMTok: 3, outputPerMTok: 15 };
const OPUS: ModelPricing = { inputPerMTok: 15, outputPerMTok: 75 };
const HAIKU: ModelPricing = { inputPerMTok: 0.8, outputPerMTok: 4 };

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': SONNET,
  'claude-sonnet-4-5': SONNET,
  'claude-3-5-sonnet-latest': SONNET,
  'claude-3-5-sonnet-20241022': SONNET,
  'claude-3-7-sonnet-latest': SONNET,
  'claude-opus-4-6': OPUS,
  'claude-opus-4-5': OPUS,
  'claude-opus-4-1': OPUS,
  'claude-3-5-haiku-latest': HAIKU,
  'claude-3-5-haiku-20241022': HAIKU,
  'claude-haiku-4-5': HAIKU,
};

function envPricing(): ModelPricing | null {
  const input = process.env.BRAIN_INPUT_COST_PER_MTOK;
  const output = process.env.BRAIN_OUTPUT_COST_PER_MTOK;
  if (!input || !output) return null;
  const inputPerMTok = parseFloat(input);
  const outputPerMTok = parseFloat(output);
  if (!Number.isFinite(inputPerMTok) || !Number.isFinite(outputPerMTok)) return null;
  return { inputPerMTok, outputPerMTok };
}

export function resolveModelPricing(model: string | null): ModelPricing {
  const env = envPricing();
  if (env) return env;
  if (!model) return SONNET;
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return OPUS;
  if (lower.includes('haiku')) return HAIKU;
  if (lower.includes('sonnet')) return SONNET;
  return SONNET;
}

/** Estimated API cost in USD for one agent run. */
export function estimateRunCostUsd(
  model: string | null,
  inputTokens: number,
  outputTokens: number
): number {
  const { inputPerMTok, outputPerMTok } = resolveModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * outputPerMTok;
  return inputCost + outputCost;
}

export function estimateInputCostUsd(model: string | null, inputTokens: number): number {
  const { inputPerMTok } = resolveModelPricing(model);
  return (inputTokens / 1_000_000) * inputPerMTok;
}

export function estimateOutputCostUsd(model: string | null, outputTokens: number): number {
  const { outputPerMTok } = resolveModelPricing(model);
  return (outputTokens / 1_000_000) * outputPerMTok;
}

/** Human-readable cost — shows cents for small amounts. */
export function fmtCostUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function getDefaultModelId(): string {
  return process.env.BRAIN_MODEL || 'claude-sonnet-4-6';
}

export function getPricingLabel(model: string | null): string {
  const p = resolveModelPricing(model);
  return `$${p.inputPerMTok}/M in · $${p.outputPerMTok}/M out`;
}
