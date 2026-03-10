-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- CA documents table for RAG embeddings
-- Stores preset descriptions, CA reference material, and command documentation
CREATE TABLE IF NOT EXISTS ca_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  category text NOT NULL,
  source text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS ca_documents_embedding_idx
  ON ca_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Function to match documents by cosine similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  category text,
  source text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ca_documents.id,
    ca_documents.title,
    ca_documents.content,
    ca_documents.category,
    ca_documents.source,
    1 - (ca_documents.embedding <=> query_embedding) AS similarity
  FROM ca_documents
  WHERE 1 - (ca_documents.embedding <=> query_embedding) > match_threshold
  ORDER BY ca_documents.embedding <=> query_embedding
  LIMIT match_count;
$$;
