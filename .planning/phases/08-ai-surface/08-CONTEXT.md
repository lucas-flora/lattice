# Phase 8: AI Surface - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The AI assistant lives in the terminal, has full app state context, can call CLI commands on the user's behalf via the CommandRegistry, and uses Supabase RAG over preset descriptions and CA documentation. Non-command terminal input (already routed to an AI placeholder in Phase 6) is now handled by a real OpenAI GPT-4o integration.

Requirements: ASST-01, ASST-02, ASST-03, ASST-04, ASST-05, ASST-06, ASST-07

</domain>

<decisions>
## Implementation Decisions

### OpenAI Integration (ASST-01)
- Use GPT-4o via the OpenAI Chat Completions API with streaming enabled
- API calls go through a Next.js API route (`/api/ai/chat`) to keep the API key server-side
- Streaming via Server-Sent Events (SSE) — the terminal displays tokens as they arrive
- The API route is a POST endpoint that accepts the user message plus app context metadata
- No raw grid state is ever sent to OpenAI — only metadata: preset name, generation count, active parameters, recent terminal actions, available commands
- Response tokens stream into the terminal as `ai` type log entries

### Context Builder (ASST-02)
- A `ContextBuilder` module assembles the system prompt and context payload before each AI call
- Context includes: current preset name, generation count, grid dimensions, live cell count, simulation running state, speed, recent terminal commands (last 10), available command list from CommandRegistry, active parameters from the preset
- ContextBuilder reads from Zustand stores (simStore, uiStore) and CommandRegistry — pure function, no side effects
- The system prompt establishes the AI as a knowledgeable CA assistant that can execute commands and explain simulation behavior
- Context is refreshed on every user message — not cached across turns

### Supabase RAG (ASST-03)
- Create a `ca_documents` table in Supabase with pgvector for embeddings
- Schema: `id (uuid)`, `title (text)`, `content (text)`, `embedding (vector(1536))`, `category (text)`, `source (text)`, `created_at (timestamptz)`
- Seed with: all 6 built-in preset descriptions (from YAML ai_context fields), CA reference material (GoL patterns, reaction-diffusion theory, elementary CA rules, Langton's Ant behavior)
- Embedding model: OpenAI `text-embedding-3-small` (1536 dimensions)
- On each user message, embed the query, find top-3 relevant documents via cosine similarity, inject as context into the system prompt
- RAG retrieval happens server-side in the API route before calling GPT-4o
- If Supabase is unavailable, AI still works — just without RAG context (graceful degradation)

### Command Execution via AI (ASST-04)
- GPT-4o is given the full command catalog in the system prompt as a tool/function schema
- When the AI determines a command should run, it returns a structured JSON action block in its response
- The client parses AI responses for command actions, executes them via `commandRegistry.execute()`, and shows both the command execution and AI explanation in the terminal
- Commands executed by AI appear in the terminal log with a distinct prefix (e.g., `[AI] > preset load gray-scott`) so the user sees what happened
- AI can chain explanations with command execution — e.g., "Loading Gray-Scott preset for you" followed by the actual command

### Typo Correction (ASST-05)
- When terminal input doesn't match a command AND doesn't look like natural language (short, command-like structure), route to AI with a "possible misspelled command" hint
- The AI detects likely command intent (e.g., "sim plya" → "sim play"), executes the corrected command, and explains the correction
- Detection heuristic: input has 1-3 words, first word matches or fuzzy-matches a command category, but full input doesn't parse as a valid command
- Levenshtein distance or similar simple fuzzy matching to detect near-misses against the command catalog
- If the typo is ambiguous (multiple possible corrections), AI asks for clarification instead of guessing

### Personality Config (ASST-06)
- A `src/ai/personality.ts` file exports a centralized personality configuration object
- Config includes: system prompt template, tone (concise/technical), verbosity level, whether to proactively suggest commands, greeting behavior
- The personality config is a static TypeScript object — not a database entry, not user-editable at runtime in v1
- Tone: helpful, concise, technically knowledgeable about cellular automata — not chatty or overly enthusiastic
- AI identifies itself as "Lattice AI" in the terminal

### Non-Intrusive Behavior (ASST-07)
- AI only responds when directly addressed (non-command input in the terminal)
- No unsolicited messages, no interruptions, no proactive suggestions unless the user asks
- Loading state shown as a subtle "thinking..." indicator in the terminal, not a full spinner
- If the AI call fails (network error, rate limit), show a brief error message and let the user retry — don't retry automatically
- AI responses are concise by default — under 3 sentences for simple queries, longer for explanations

### Claude's Discretion
- Exact system prompt wording and token budget allocation between context, RAG, and conversation
- Specific RAG document content and chunking strategy for CA reference material
- Internal retry/timeout logic for OpenAI API calls
- Exact fuzzy matching algorithm for typo detection (Levenshtein vs Jaro-Winkler vs simpler)
- Whether to include conversation history in API calls (and how many turns to keep)
- Loading indicator animation/style in the terminal

</decisions>

<specifics>
## Specific Ideas

- Success criterion #1 is explicit: streaming GPT-4o response with awareness of current preset, generation count, and active parameters
- Success criterion #2 requires the AI to execute "load the Gray-Scott preset" — command appears in terminal log and simulation changes
- Success criterion #3 requires "sim plya" to trigger AI typo correction — corrected command executes and AI explains the correction
- Success criterion #4 requires RAG retrieval from Supabase pgvector with citations in responses about rule behavior
- Success criterion #5 requires NO raw grid state sent to OpenAI — only metadata (preset name, generation, parameters, recent actions) — confirmed by inspecting request body

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/terminal/useTerminal.ts`: Terminal hook with `addLogEntry()` and `executeInput()` — the AI placeholder at line 103 ("AI not connected") is the exact integration point to replace
- `src/components/terminal/commandParser.ts`: `parseCommand()`, `isCommand()`, `getGhostText()` — use `isCommand()` to distinguish command vs AI input, and for typo detection
- `src/commands/CommandRegistry.ts`: `commandRegistry` singleton with `execute()`, `list()`, `get()`, `has()` — AI reads catalog via `list()` and executes via `execute()`
- `src/commands/SimulationController.ts`: Full simulation lifecycle with `getStatus()` — provides generation, liveCellCount, isRunning, activePreset, speed
- `src/store/simStore.ts`: Zustand store with generation, isRunning, activePreset, gridWidth, gridHeight, liveCellCount, speed
- `src/store/aiStore.ts`: Already scaffolded with `ChatMessage`, `isLoading`, `addMessage()`, `setLoading()` — ready for Phase 8 wiring
- `src/engine/core/EventBus.ts`: Typed event bus — may add `ai:response`, `ai:command` events
- `src/commands/definitions/preset.ts`: `BUILTIN_PRESET_NAMES` and `preset.list` command — AI uses these for preset awareness

### Established Patterns
- Commands are async, return `CommandResult { success, data?, error? }` — AI command execution follows same pattern
- Zustand stores use `subscribeWithSelector` middleware — aiStore already follows this
- Engine is pure TypeScript with zero UI imports — AI service layer follows same isolation
- Event dot notation: `sim:tick`, `sim:play` — new AI events follow same pattern
- Test co-location: `__tests__/` directories next to source files
- Next.js API routes for server-side operations (API key protection)

### Integration Points
- `src/components/terminal/useTerminal.ts` line 101-103: Replace "AI not connected" placeholder with real AI call
- `src/store/aiStore.ts`: Wire chat history and loading state to AI responses
- `src/commands/wireStores.ts`: May extend for AI-related event wiring
- `src/app/api/ai/chat/route.ts`: New API route for OpenAI calls (server-side)
- `src/ai/`: Empty directory ready for AI modules (ContextBuilder, personality, RAG client)

</code_context>

<deferred>
## Deferred Ideas

- User-editable personality config via UI panel — Phase 10 (Polish)
- Multi-turn conversation memory with token management — future enhancement
- AI-generated preset suggestions based on user behavior — future phase
- Voice input to AI assistant — out of scope

</deferred>

## Testing Requirements (AX)

All new functionality in this phase MUST include:
- **Unit tests** for all new functions/methods (mock external deps)
- **Integration tests** for all new API endpoints, DB operations, and service integrations
- **Scenario tests** for all new user-facing workflows

Test naming: `Test<Component>_<Behavior>[_<Condition>]`
Reference: TEST_GUIDE.md for requirement mapping, .claude/ax/references/testing-pyramid.md for methodology

---

*Phase: 08-ai-surface*
*Context gathered: 2026-03-10*
