/**
 * AI module type definitions.
 *
 * Shared between client and server for AI request/response shapes.
 * These types define the contract for the AI pipeline:
 * terminal → client service → API route → OpenAI → streaming response.
 */

/**
 * Metadata payload sent to the AI API route.
 * Contains ONLY scalar metadata — never raw grid buffers.
 * This is the context the AI uses to understand the current app state.
 */
export interface AiContext {
  /** Name of the currently loaded preset, or null */
  presetName: string | null;
  /** Current simulation generation number */
  generation: number;
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
  /** Number of live (non-zero) cells */
  liveCellCount: number;
  /** Whether the simulation is currently running */
  isRunning: boolean;
  /** Current simulation speed in FPS (0 = max) */
  speed: number;
  /** Recent terminal actions (last 10) */
  recentActions: string[];
  /** Available commands from the registry */
  availableCommands: { name: string; description: string }[];
}

/**
 * Request body for the AI chat API route.
 */
export interface AiChatRequest {
  /** User's message */
  message: string;
  /** Current app state context (metadata only) */
  context: AiContext;
  /** Optional conversation history for multi-turn context */
  conversationHistory?: { role: string; content: string }[];
}

/**
 * Parsed AI response — text content and optional command actions.
 */
export interface AiChatResponse {
  /** Response type: text-only or includes a command */
  type: 'text' | 'command';
  /** The text content of the response */
  content: string;
  /** Optional command the AI wants to execute */
  command?: { name: string; params: Record<string, unknown> };
}

/**
 * Individual chunk in the SSE stream from the API route.
 */
export interface AiStreamChunk {
  /** Chunk type */
  type: 'delta' | 'done' | 'error' | 'command';
  /** Text content delta or error message */
  content?: string;
  /** Command action parsed from the AI response */
  command?: { name: string; params: Record<string, unknown> };
}
