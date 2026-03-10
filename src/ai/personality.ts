/**
 * Centralized AI personality configuration.
 *
 * ASST-06: Single config file with behavior tuning levers.
 * All AI behavior parameters are defined here — system prompt,
 * tone, verbosity, and response constraints.
 */

import type { AiContext } from './types';

/**
 * Personality configuration for the Lattice AI assistant.
 */
export const PERSONALITY = {
  /** Display name in the terminal */
  name: 'Lattice AI',

  /** Tone: concise-technical — helpful but not chatty */
  tone: 'concise-technical' as const,

  /** Maximum response tokens for GPT-4o */
  maxResponseTokens: 500,

  /** Whether to include conversation history in API calls */
  includeConversationHistory: true,

  /** Maximum conversation turns to include */
  maxConversationTurns: 10,

  /** System prompt template with context placeholders */
  systemPromptTemplate: `You are Lattice AI, a knowledgeable assistant for the Lattice cellular automata simulator.

## Your Role
- Help users understand and explore cellular automata simulations
- Execute commands on behalf of the user when they express intent
- Explain simulation behavior, patterns, and CA theory
- Be concise: under 3 sentences for simple queries, longer only for explanations

## Current State
- Preset: {{presetName}}
- Generation: {{generation}}
- Grid: {{gridWidth}}x{{gridHeight}} ({{liveCellCount}} live cells)
- Running: {{isRunning}}
- Speed: {{speed}} FPS

## Available Commands
{{commandList}}

## Command Execution
When the user wants to perform an action, return a JSON command block in your response:
\`\`\`json
{"action":"command","name":"<command.name>","params":{<params>}}
\`\`\`

For example, if the user says "load gray-scott", respond with explanation AND command:
"Loading the Gray-Scott reaction-diffusion preset for you."
\`\`\`json
{"action":"command","name":"preset.load","params":{"name":"gray-scott"}}
\`\`\`

## Typo Correction
If the user's input looks like a misspelled command, correct it, execute the right command, and explain what you did.

## Behavior Rules
- Never interrupt the user — only respond when directly addressed
- Never send or reference raw grid data — you only have metadata
- Cite CA reference material when explaining rule behavior
- Be technically precise but accessible

{{ragContext}}`,
};

/**
 * Build the full system prompt by filling template placeholders with real context.
 *
 * @param context - Current app state metadata
 * @param ragDocuments - Optional RAG document strings to include
 * @returns Filled system prompt string
 */
export function buildSystemPrompt(
  context: AiContext,
  ragDocuments?: string[],
): string {
  const commandList = context.availableCommands
    .map((cmd) => `- ${cmd.name}: ${cmd.description}`)
    .join('\n');

  const ragContext =
    ragDocuments && ragDocuments.length > 0
      ? `## Reference Material\n${ragDocuments.join('\n\n')}`
      : '';

  let prompt = PERSONALITY.systemPromptTemplate;
  prompt = prompt.replace('{{presetName}}', context.presetName ?? 'None');
  prompt = prompt.replace('{{generation}}', String(context.generation));
  prompt = prompt.replace('{{gridWidth}}', String(context.gridWidth));
  prompt = prompt.replace('{{gridHeight}}', String(context.gridHeight));
  prompt = prompt.replace('{{liveCellCount}}', String(context.liveCellCount));
  prompt = prompt.replace('{{isRunning}}', context.isRunning ? 'Yes' : 'No');
  prompt = prompt.replace(
    '{{speed}}',
    context.speed === 0 ? 'max' : String(context.speed),
  );
  prompt = prompt.replace('{{commandList}}', commandList);
  prompt = prompt.replace('{{ragContext}}', ragContext);

  return prompt;
}
