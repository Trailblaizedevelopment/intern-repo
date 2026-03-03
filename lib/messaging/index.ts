/**
 * Messaging module entry point.
 * Swap the provider here to change messaging backends.
 * Everything else imports from this file or ./types.ts
 */

import { LinqProvider } from './providers/linq';
import { createMessagingService } from './service';

// Swap this one line to change providers
const provider = new LinqProvider();

export const messaging = createMessagingService(provider);

// Re-export types for convenience
export * from './types';
export { classifyResponse, renderTemplate } from './classify';
export type { ResponseClassification, ClassificationResult } from './classify';
