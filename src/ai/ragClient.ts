/**
 * RAG client for Supabase pgvector retrieval.
 *
 * ASST-03: Retrieves relevant CA reference material and preset descriptions
 * from Supabase pgvector to augment AI responses with citations.
 *
 * Graceful degradation: if Supabase is unreachable, returns empty results.
 * Never throws — errors are logged and swallowed.
 */

import { generateEmbedding } from './embeddings';

/**
 * A document retrieved from the RAG store.
 */
export interface RagDocument {
  title: string;
  content: string;
  category: string;
  source: string;
  similarity: number;
}

/**
 * Retrieve relevant documents from Supabase pgvector by cosine similarity.
 *
 * @param query - The user's query text
 * @param options - Optional retrieval parameters
 * @returns Array of relevant documents (empty on error)
 */
export async function retrieveRelevantDocuments(
  query: string,
  options?: { topK?: number; threshold?: number },
): Promise<RagDocument[]> {
  const topK = options?.topK ?? 3;
  const threshold = options?.threshold ?? 0.5;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('RAG: Supabase credentials not configured — skipping retrieval');
    return [];
  }

  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (err) {
    console.warn('RAG: Failed to generate embedding:', err);
    return [];
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_documents`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: topK,
      }),
    });

    if (!response.ok) {
      console.warn(`RAG: Supabase query failed (${response.status})`);
      return [];
    }

    const rows = (await response.json()) as Array<{
      title: string;
      content: string;
      category: string;
      source: string;
      similarity: number;
    }>;

    return rows.map((row) => ({
      title: row.title,
      content: row.content,
      category: row.category,
      source: row.source,
      similarity: row.similarity,
    }));
  } catch (err) {
    console.warn('RAG: Supabase query error:', err);
    return [];
  }
}

/**
 * Format RAG documents into a string suitable for the system prompt.
 * Each document is cited with title and source.
 *
 * @param documents - Retrieved RAG documents
 * @returns Formatted string with citations
 */
export function formatRagContext(documents: RagDocument[]): string {
  if (documents.length === 0) return '';

  return documents
    .map(
      (doc) =>
        `According to "${doc.title}" (${doc.source}):\n${doc.content}`,
    )
    .join('\n\n');
}
