/**
 * Messaging module entry point.
 * Swap providers by changing the import below — nothing else needs to change.
 */

import { LinqProvider } from './providers/linq';
import { createMessagingService } from './service';

const provider = new LinqProvider();
export const messaging = createMessagingService(provider);

// Re-export types for convenience
export * from './types';
export { classifyResponse, renderTemplate } from './classify';
export type { MessagingProvider } from './provider';
export type { ResponseClassification, ClassificationResult } from './classify';
