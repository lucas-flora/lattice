/**
 * Unit tests for RAG client.
 *
 * Tests Supabase pgvector retrieval with mocked fetch,
 * graceful degradation on errors, and document formatting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retrieveRelevantDocuments, formatRagContext } from '../ragClient';
import type { RagDocument } from '../ragClient';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

describe('RAG Client', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('TestRagClient_RetrievesDocuments', async () => {
    const mockDocs = [
      { title: 'GoL Patterns', content: 'Gliders move diagonally', category: 'patterns', source: 'ca-reference', similarity: 0.95 },
      { title: 'Rule 110', content: 'Turing complete', category: 'theory', source: 'ca-reference', similarity: 0.85 },
      { title: 'Commands', content: 'sim play', category: 'commands', source: 'lattice-docs', similarity: 0.75 },
    ];

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (typeof url === 'string' && url.includes('openai.com')) {
        // Embedding API call
        return new Response(JSON.stringify({
          data: [{ embedding: Array(1536).fill(0.1), index: 0 }],
        }));
      }
      // Supabase RPC call
      return new Response(JSON.stringify(mockDocs));
    });

    const docs = await retrieveRelevantDocuments('what is game of life?');

    expect(docs).toHaveLength(3);
    expect(docs[0].title).toBe('GoL Patterns');
    expect(docs[0].similarity).toBe(0.95);
    expect(callCount).toBe(2); // 1 embedding + 1 supabase
  });

  it('TestRagClient_GracefulDegradation_NetworkError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    const docs = await retrieveRelevantDocuments('test query');
    expect(docs).toEqual([]); // Returns empty, doesn't throw
  });

  it('TestRagClient_GracefulDegradation_MissingEnvVars', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const docs = await retrieveRelevantDocuments('test query');
    expect(docs).toEqual([]); // Returns empty, doesn't throw
  });

  it('TestRagClient_GracefulDegradation_SupabaseError', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('openai.com')) {
        return new Response(JSON.stringify({
          data: [{ embedding: Array(1536).fill(0.1), index: 0 }],
        }));
      }
      // Supabase returns error
      return new Response('Internal Server Error', { status: 500 });
    });

    const docs = await retrieveRelevantDocuments('test query');
    expect(docs).toEqual([]);
  });

  it('TestRagClient_FormatRagContext_FormatsWithCitations', () => {
    const docs: RagDocument[] = [
      { title: 'GoL Patterns', content: 'Gliders move diagonally.', category: 'patterns', source: 'ca-reference', similarity: 0.9 },
      { title: 'Rule 110', content: 'Turing complete.', category: 'theory', source: 'ca-reference', similarity: 0.8 },
    ];

    const formatted = formatRagContext(docs);
    expect(formatted).toContain('According to "GoL Patterns" (ca-reference)');
    expect(formatted).toContain('Gliders move diagonally.');
    expect(formatted).toContain('According to "Rule 110" (ca-reference)');
    expect(formatted).toContain('Turing complete.');
  });

  it('TestRagClient_FormatRagContext_EmptyArray', () => {
    const formatted = formatRagContext([]);
    expect(formatted).toBe('');
  });
});
