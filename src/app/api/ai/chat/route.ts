/**
 * AI Chat API route.
 *
 * ASST-01: Server-side OpenAI GPT-4o integration with streaming via SSE.
 * Keeps OPENAI_API_KEY server-side — never exposed to the client.
 *
 * Accepts POST with user message + context metadata.
 * Returns a streaming SSE response with AiStreamChunk payloads.
 *
 * ASST-03: Integrates RAG retrieval from Supabase pgvector.
 * ASST-07: Never sends raw grid state — only metadata from context.
 */

import { buildSystemPrompt } from '@/ai/personality';
import { retrieveRelevantDocuments, formatRagContext } from '@/ai/ragClient';
import type { AiChatRequest, AiStreamChunk } from '@/ai/types';
import { PERSONALITY } from '@/ai/personality';

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: AiChatRequest;
  try {
    body = (await request.json()) as AiChatRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { message, context, conversationHistory } = body;

  // RAG retrieval — graceful degradation if unavailable
  let ragDocStrings: string[] = [];
  try {
    const ragDocs = await retrieveRelevantDocuments(message);
    if (ragDocs.length > 0) {
      ragDocStrings = [formatRagContext(ragDocs)];
    }
  } catch {
    // RAG unavailable — continue without it
  }

  // Build system prompt with context and RAG
  const systemPrompt = buildSystemPrompt(context, ragDocStrings);

  // Build messages array
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (limited to configured turns)
  if (
    PERSONALITY.includeConversationHistory &&
    conversationHistory &&
    conversationHistory.length > 0
  ) {
    const maxTurns = PERSONALITY.maxConversationTurns * 2; // user + assistant pairs
    const recentHistory = conversationHistory.slice(-maxTurns);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message
  messages.push({ role: 'user', content: message });

  // Call OpenAI Chat Completions API with streaming
  let openaiResponse: Response;
  try {
    openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          stream: true,
          max_tokens: PERSONALITY.maxResponseTokens,
          temperature: 0.7,
        }),
      },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Network error';
    return new Response(
      JSON.stringify({ error: `OpenAI API error: ${errorMsg}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text().catch(() => 'Unknown error');
    return new Response(
      JSON.stringify({ error: `OpenAI API error (${openaiResponse.status}): ${errorText}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Stream the response as SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = '';

      const sendChunk = (chunk: AiStreamChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };

      try {
        const reader = openaiResponse.body?.getReader();
        if (!reader) {
          sendChunk({ type: 'error', content: 'No response body' });
          controller.close();
          return;
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
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
              };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullText += delta;
                sendChunk({ type: 'delta', content: delta });
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }

        // After stream completes, check for command blocks in the full response
        const commandMatch = fullText.match(
          /```json\s*\n?\s*(\{[\s\S]*?"action"\s*:\s*"command"[\s\S]*?\})\s*\n?\s*```/,
        );
        if (commandMatch) {
          try {
            const cmdObj = JSON.parse(commandMatch[1]) as {
              action: string;
              name: string;
              params: Record<string, unknown>;
            };
            if (cmdObj.action === 'command' && cmdObj.name) {
              sendChunk({
                type: 'command',
                command: { name: cmdObj.name, params: cmdObj.params ?? {} },
              });
            }
          } catch {
            // Command parsing failed — not fatal
          }
        }

        sendChunk({ type: 'done' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Stream error';
        sendChunk({ type: 'error', content: errorMsg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
