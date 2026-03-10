/**
 * AI module barrel export.
 *
 * Central export point for all AI-related functionality.
 */

export { aiService, AiService } from './aiService';
export { buildAiContext } from './contextBuilder';
export { PERSONALITY, buildSystemPrompt } from './personality';
export { retrieveRelevantDocuments, formatRagContext } from './ragClient';
export type { RagDocument } from './ragClient';
export { detectPossibleTypo, levenshtein } from './typoDetector';
export type { TypoDetectionResult } from './typoDetector';
export type {
  AiContext,
  AiChatRequest,
  AiChatResponse,
  AiStreamChunk,
} from './types';
