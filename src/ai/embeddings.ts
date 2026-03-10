/**
 * OpenAI embedding generation.
 *
 * Generates vector embeddings using text-embedding-3-small (1536 dimensions)
 * for use with Supabase pgvector RAG retrieval.
 */

/**
 * Generate an embedding vector for a single text string.
 *
 * @param text - The text to embed
 * @returns 1536-dimensional embedding array
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `OpenAI Embeddings API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 *
 * @param texts - Array of texts to embed
 * @returns Array of 1536-dimensional embedding arrays
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `OpenAI Embeddings API error (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  // Sort by index to maintain order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
