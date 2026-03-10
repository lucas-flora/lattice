# Phase 8: AI Surface — Phase Report

**Completed:** 2026-03-10
**Branch:** phase-8
**Status:** Complete

## Summary

Implemented the AI assistant surface in the terminal, fulfilling requirements ASST-01 through ASST-07. The AI lives in the existing terminal component, has full app state context via the ContextBuilder, can execute CLI commands on the user's behalf via CommandRegistry, uses Supabase pgvector RAG over CA documentation, detects and corrects typos, and has a centralized personality configuration.

## Requirements Delivered

| Requirement | Description | Status |
|---|---|---|
| ASST-01 | OpenAI GPT-4o integration in terminal | Done |
| ASST-02 | Full app state context (metadata only) | Done |
| ASST-03 | Supabase RAG with pgvector embeddings | Done |
| ASST-04 | Command execution via CommandRegistry | Done |
| ASST-05 | Typo detection and correction | Done |
| ASST-06 | Centralized personality config | Done |
| ASST-07 | Non-intrusive behavior | Done |

## Architecture

### New Modules

- `src/ai/types.ts` — Shared type definitions (AiContext, AiChatRequest, AiStreamChunk)
- `src/ai/contextBuilder.ts` — Assembles metadata-only context from stores (never grid buffers)
- `src/ai/personality.ts` — Centralized personality config and system prompt builder
- `src/ai/embeddings.ts` — OpenAI text-embedding-3-small (1536 dim) integration
- `src/ai/ragClient.ts` — Supabase pgvector retrieval with graceful degradation
- `src/ai/typoDetector.ts` — Levenshtein distance-based typo detection
- `src/ai/aiService.ts` — Client-side AI service with streaming and command parsing
- `src/ai/index.ts` — Barrel export
- `src/app/api/ai/chat/route.ts` — Next.js API route for server-side OpenAI streaming

### Database

- `supabase/migrations/001_ca_documents.sql` — pgvector table and match_documents RPC function
- 13 seeded documents: 7 CA reference + 6 preset descriptions

### Integration Points

- `src/components/terminal/useTerminal.ts` — Replaced "AI not connected" placeholder with real AI calls
- `src/store/aiStore.ts` — Added clearHistory action, wired to AI service

## Data Flow

1. User types non-command input in terminal
2. `useTerminal.executeInput()` detects non-command input, calls `aiService.handleTerminalInput()`
3. `AiService` checks for typos via `detectPossibleTypo()`
4. `AiService` builds context via `buildAiContext()` from simStore + commandRegistry
5. Client sends POST to `/api/ai/chat` with message + context (metadata only)
6. API route retrieves RAG documents from Supabase, builds system prompt, calls OpenAI
7. OpenAI streams response via SSE back to client
8. Client parses stream, displays text in terminal, executes any command actions via `commandRegistry.execute()`
9. Commands executed by AI appear as `[AI] > command` in terminal log

## Test Coverage

| Tier | Count | Details |
|---|---|---|
| Unit | 48 new (434 total) | contextBuilder (7), personality (8), typoDetector (13), aiService (10), ragClient (6), plus 4 from updated existing |
| Integration | 6 new (22 total) | Full pipeline with real stores, command execution, RAG, no grid state |
| Scenario | 5 new (20 total) | Natural language, command execution, typo correction, RAG citation, no grid leak |

**Total tests:** 476 (434 unit + 22 integration + 20 scenario)

## Success Criteria Verification

1. **Streaming GPT-4o response with context awareness** — API route streams via SSE, system prompt includes preset name, generation, parameters. Verified by scenario test.
2. **AI executes commands on behalf** — "load gray-scott" triggers preset.load command, appears in terminal log as [AI] > preset load gray-scott. Verified by scenario test.
3. **Typo correction** — "sim plya" detected by Levenshtein distance, routed to AI with correction hint, AI executes corrected command. Verified by unit + scenario tests.
4. **RAG retrieval with citations** — 13 documents in Supabase pgvector, match_documents RPC returns top-3 by cosine similarity, formatted with citations in system prompt. Verified by integration test.
5. **No raw grid state to OpenAI** — ContextBuilder only includes scalar metadata, verified by 3 separate test assertions (unit, integration, scenario) that inspect the request body for Float32Array/ArrayBuffer.

## Files Changed

### New Files (14)
- `src/ai/types.ts`, `contextBuilder.ts`, `personality.ts`, `embeddings.ts`, `ragClient.ts`, `typoDetector.ts`, `aiService.ts`, `index.ts`
- `src/app/api/ai/chat/route.ts`
- `supabase/migrations/001_ca_documents.sql`
- `scripts/seed-rag.ts`
- `src/ai/__tests__/` (5 test files)
- `test/integration/ai-surface.test.ts`
- `test/scenarios/ai-surface-workflow.test.ts`

### Modified Files (2)
- `src/components/terminal/useTerminal.ts` — Replaced AI placeholder with real AI service
- `src/store/aiStore.ts` — Added clearHistory action
