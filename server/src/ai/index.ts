import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AnthropicProvider } from './providers/anthropicProvider.js';
import type { AiAssessmentRequest, AiProvider, AiResult } from './types.js';

export type { AiAssessment, AiAssessmentRequest, AiResult } from './types.js';

/**
 * Provider registry. Adding a second vendor means implementing AiProvider and
 * registering it here — nothing else in the app changes.
 */
const providers: Record<string, () => AiProvider> = {
  anthropic: () => new AnthropicProvider(),
};

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider | null {
  if (cached) return cached;
  const factory = providers[env.AI_PROVIDER];
  if (!factory) {
    logger.warn(`Unknown AI_PROVIDER "${env.AI_PROVIDER}" — AI insights disabled.`);
    return null;
  }
  const provider = factory();
  if (!provider.isConfigured()) return null;
  cached = provider;
  return provider;
}

export const isAiEnabled = () => getAiProvider() !== null;

/**
 * Runs the AI layer and never throws. A failure returns
 * `{ available: false, error }` so callers can render "AI insights unavailable"
 * beside the deterministic assessment, which is always present.
 */
export async function generateAiAssessment(input: AiAssessmentRequest): Promise<AiResult> {
  const provider = getAiProvider();
  if (!provider) {
    return { available: false, error: 'AI provider is not configured on this server.' };
  }

  try {
    const data = await provider.generateAssessment(input);
    return { available: true, data, model: provider.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    logger.warn(`AI assessment failed (${provider.name}): ${message}`);
    return { available: false, error: message, model: provider.model };
  }
}
