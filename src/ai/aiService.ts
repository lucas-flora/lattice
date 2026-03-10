/**
 * Client-side AI service for the terminal.
 *
 * Handles streaming SSE responses from the API route, parses command actions
 * from AI output, and executes them via CommandRegistry.
 *
 * ASST-01: Streaming GPT-4o responses
 * ASST-04: Command execution on user's behalf
 * ASST-05: Typo detection and correction
 * ASST-07: Non-intrusive — only responds when directly addressed
 */

import type { AiChatRequest, AiStreamChunk } from './types';
import { buildAiContext } from './contextBuilder';
import { detectPossibleTypo } from './typoDetector';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useSimStore } from '@/store/simStore';
import { useAiStore, aiStoreActions } from '@/store/aiStore';
import type { LogEntryType } from '@/components/terminal/useTerminal';

/**
 * Client-side AI service that manages communication with the AI API route,
 * streams responses to the terminal, and executes commands on behalf of the user.
 */
export class AiService {
  /** Rolling buffer of recent terminal actions (max 10) */
  private recentActions: string[] = [];

  /**
   * Track a recent terminal action for context.
   */
  addRecentAction(action: string): void {
    this.recentActions.push(action);
    if (this.recentActions.length > 10) {
      this.recentActions = this.recentActions.slice(-10);
    }
  }

  /**
   * Send a message to the AI and get a streaming response.
   *
   * @param message - The user's message
   * @param options - Optional typo hint or callbacks
   * @returns The full response text and any commands that were returned
   */
  async sendMessage(
    message: string,
    options?: {
      typoHint?: string;
      onDelta?: (text: string) => void;
    },
  ): Promise<{
    text: string;
    commands: Array<{ name: string; params: Record<string, unknown> }>;
  }> {
    // Build context from current stores
    const simState = useSimStore.getState();
    const commandList = commandRegistry.list();
    const context = buildAiContext(simState, commandList, this.recentActions);

    // Prepend typo hint if provided
    const fullMessage = options?.typoHint
      ? `[System: The user may have misspelled a command. ${options.typoHint}]\n\nUser input: ${message}`
      : message;

    // Build conversation history from aiStore
    const chatHistory = useAiStore.getState().chatHistory;
    const conversationHistory = chatHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const request: AiChatRequest = {
      message: fullMessage,
      context,
      conversationHistory,
    };

    // Set loading state
    aiStoreActions.setLoading(true);

    let fullText = '';
    const commands: Array<{ name: string; params: Record<string, unknown> }> = [];

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error((error as { error?: string }).error ?? `API error: ${response.status}`);
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const chunk = JSON.parse(data) as AiStreamChunk;

            switch (chunk.type) {
              case 'delta':
                if (chunk.content) {
                  fullText += chunk.content;
                  options?.onDelta?.(chunk.content);
                }
                break;
              case 'command':
                if (chunk.command) {
                  commands.push(chunk.command);
                }
                break;
              case 'error':
                throw new Error(chunk.content ?? 'AI stream error');
              case 'done':
                break;
            }
          } catch (e) {
            if (e instanceof Error && e.message === (e as Error).message) {
              // Re-throw stream errors
              if (data.includes('"error"')) throw e;
            }
            // Skip malformed chunks
          }
        }
      }
    } catch (err) {
      aiStoreActions.setLoading(false);
      throw err;
    }

    // Update aiStore with the conversation
    aiStoreActions.addMessage({
      role: 'user',
      content: message,
      timestamp: Date.now(),
    });
    aiStoreActions.addMessage({
      role: 'assistant',
      content: fullText,
      timestamp: Date.now(),
    });
    aiStoreActions.setLoading(false);

    return { text: fullText, commands };
  }

  /**
   * Handle terminal input that wasn't recognized as a command.
   * This is the main entry point called from useTerminal.
   *
   * Handles typo detection, AI streaming, and command execution.
   */
  async handleTerminalInput(
    input: string,
    addLogEntry: (type: LogEntryType, message: string) => void,
  ): Promise<void> {
    // Check for typo first
    const commandNames = commandRegistry.list().map((c) => c.name);
    const typoResult = detectPossibleTypo(input, commandNames);

    // Show loading indicator
    addLogEntry('ai', 'thinking...');

    let responseText = '';
    try {
      const result = await this.sendMessage(input, {
        typoHint: typoResult.isTypo ? typoResult.hint : undefined,
        onDelta: () => {
          // Streaming handled via final text display
        },
      });

      responseText = result.text;

      // Clean the response text — remove JSON command blocks for display
      const displayText = responseText
        .replace(/```json\s*\n?\s*\{[\s\S]*?"action"\s*:\s*"command"[\s\S]*?\}\s*\n?\s*```/g, '')
        .trim();

      if (displayText) {
        addLogEntry('ai', displayText);
      }

      // Execute any commands the AI returned
      for (const cmd of result.commands) {
        const cliForm = cmd.name.replace('.', ' ');
        const paramsStr = Object.keys(cmd.params).length > 0
          ? ' ' + Object.values(cmd.params).join(' ')
          : '';
        addLogEntry('command', `[AI] > ${cliForm}${paramsStr}`);

        const cmdResult = await commandRegistry.execute(cmd.name, cmd.params);
        if (cmdResult.success) {
          if (cmdResult.data) {
            addLogEntry('info', JSON.stringify(cmdResult.data));
          }
        } else {
          addLogEntry('error', cmdResult.error ?? 'Command failed');
        }

        this.addRecentAction(`[AI] ${cmd.name}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'AI request failed';
      addLogEntry('error', `AI error: ${errorMsg}`);
    }
  }
}

/** Global AiService singleton */
export const aiService = new AiService();
