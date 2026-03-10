# Phase 5: Command Hub - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The CommandRegistry is established as the architectural hub -- every app action registered as a command, Zustand stores wired to engine events, no surface yet but the routing infrastructure is in place and testable. This phase is pure infrastructure -- no GUI buttons, no CLI terminal, no user-visible UI.

Requirements: CMDS-01, CMDS-02, CMDS-03, CMDS-04

</domain>

<decisions>
## Implementation Decisions

### Command Registry Architecture
- Central `CommandRegistry` singleton class in `src/commands/CommandRegistry.ts`
- Commands registered via `CommandRegistry.register(definition)` where definition includes: `name`, `description`, `category`, `params` (Zod schema), and `execute` function
- Command names follow dot notation: `sim.play`, `sim.pause`, `sim.step`, `sim.reset`, `preset.load`, `view.zoom`, `view.pan`, `view.fit`, `edit.undo`, `edit.redo`, `ui.toggleTerminal`, `ui.toggleParamPanel`
- `CommandRegistry.list()` returns typed catalog of all registered commands with name, description, and parameter schema
- `CommandRegistry.execute(name, params)` validates params against schema, then calls the command's execute function
- `CommandRegistry.get(name)` returns a single command definition or undefined
- Commands are grouped by category: `sim`, `preset`, `view`, `edit`, `ui`
- All commands are async (return `Promise<CommandResult>`) even if the underlying operation is synchronous -- future-proofs for Worker communication
- `CommandResult` type: `{ success: boolean, data?: unknown, error?: string }`

### Engine Event Bus
- Lightweight typed event emitter in `src/engine/core/EventBus.ts` -- pure TypeScript, no external deps
- Event types: `sim:tick`, `sim:play`, `sim:pause`, `sim:reset`, `sim:presetLoaded`, `view:change`, `ui:change`, `edit:undo`, `edit:redo`
- Events carry typed payloads (e.g., `sim:tick` carries `{ generation: number }`)
- EventBus is a standalone class, not coupled to the engine -- any component can emit or subscribe
- The Simulation class does NOT directly emit events -- a `SimulationController` wrapper in `src/commands/SimulationController.ts` manages the Simulation lifecycle and emits events via the EventBus
- Single global EventBus instance exported from module

### Store-Event Wiring
- Each Zustand store subscribes to relevant EventBus events and updates accordingly
- `simStore` listens to: `sim:tick` (generation), `sim:play`/`sim:pause` (isRunning), `sim:presetLoaded` (activePreset, gridWidth, gridHeight), `sim:reset` (generation=0)
- `viewStore` listens to: `view:change` (zoom, cameraX, cameraY)
- `uiStore` listens to: `ui:change` (panel visibility)
- `aiStore` listens to: AI events (deferred to Phase 8, subscription point established now)
- Store wiring happens in `src/commands/wireStores.ts` -- a function that takes EventBus and subscribes all stores
- Wiring is called once at app initialization

### SimulationController
- `SimulationController` in `src/commands/SimulationController.ts` wraps the Simulation class
- Manages play/pause state with a tick loop (requestAnimationFrame or setInterval for Node.js tests)
- Methods: `play()`, `pause()`, `step()`, `reset()`, `loadPreset(name)`, `isPlaying()`, `getGeneration()`
- Emits events via EventBus after each state change
- Commands call SimulationController methods, not Simulation directly
- In Phase 5, SimulationController runs in the main thread (Worker integration deferred)

### Three Surface Doctrine Enforcement
- The CommandRegistry IS the enforcement mechanism -- if an action isn't a registered command, it can't be wired to GUI or CLI
- Phase 5 establishes the registry and registers all commands, but does not build GUI buttons or CLI terminal (Phase 6)
- Every registered command definition includes metadata sufficient for both GUI rendering (label, icon hint) and CLI invocation (name, params)
- A type-level `CommandDefinition` enforces that all required metadata is present at registration time
- Test: verify that all registered commands have complete metadata for both surfaces

### Command Parameter Schemas
- Each command defines its params as a Zod schema (reusing the project's existing Zod dependency)
- `sim.play` / `sim.pause` / `sim.step` / `sim.reset`: no params (empty object schema)
- `preset.load`: `{ name: string }` -- preset name
- `view.zoom`: `{ level: number }` -- zoom level
- `view.pan`: `{ x: number, y: number }` -- camera position
- `view.fit`: no params
- `edit.undo` / `edit.redo`: no params
- `ui.toggleTerminal` / `ui.toggleParamPanel`: no params
- Invalid params produce a typed error result, never throw

### Claude's Discretion
- Exact EventBus implementation (class vs functional)
- Whether to use WeakRef for event subscriptions
- Exact tick loop timing strategy in SimulationController
- Internal error handling patterns within commands
- Whether CommandResult carries structured data or just success/error

</decisions>

<specifics>
## Specific Ideas

- Success criterion #2 is explicit: `CommandRegistry.execute("sim.play", {})` starts the simulation -- this means the registry must be wired to a real SimulationController, not just a stub
- Success criterion #3 requires a test proving command-via-registry produces identical state change as calling the engine method directly -- this is the key test for the architecture
- Success criterion #4 requires all four Zustand stores (simStore, viewStore, uiStore, aiStore) to update reactively from engine events -- a subscriber test must record the event sequence
- The Three Surface Doctrine (CMDS-04) is enforced by architecture, not by a lint rule -- if it's not in the registry, it can't be used by any surface

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/rule/Simulation.ts`: Simulation facade with `tick()`, `reset()`, `tickN()`, `getGeneration()` -- SimulationController wraps this
- `src/engine/rule/CommandHistory.ts`: Undo/redo with sparse diffs -- commands `edit.undo` / `edit.redo` delegate to this
- `src/engine/preset/builtinPresets.ts`: `loadBuiltinPreset(name)` -- `preset.load` command uses this
- `src/store/simStore.ts`, `viewStore.ts`, `uiStore.ts`, `aiStore.ts`: All exist with `subscribeWithSelector` middleware -- ready for event wiring
- `src/commands/`: Directory exists but is empty -- this is where CommandRegistry and command definitions will live

### Established Patterns
- Engine is pure TypeScript, zero UI imports -- EventBus must follow this (no React, no DOM)
- Zustand stores use `subscribeWithSelector` middleware -- stores can be updated via `setState()`
- Test naming: `Test<Component>_<Behavior>[_<Condition>]`
- Tests co-located in `__tests__/` directories
- PresetConfig type inferred from Zod schema

### Integration Points
- `src/commands/` directory (empty) -- all new code goes here
- `src/store/index.ts` -- may need to export store setters or internal references for event wiring
- `src/engine/core/index.ts` -- EventBus types will be re-exported from here
- `src/app/page.tsx` -- will eventually call `wireStores()` at initialization, but no UI changes in Phase 5

</code_context>

<deferred>
## Deferred Ideas

- GUI buttons wired to CommandRegistry -- Phase 6 (Surfaces)
- CLI terminal wired to CommandRegistry -- Phase 6 (Surfaces)
- Worker-based simulation execution -- Phase 7 (WASM Acceleration) or later
- AI command execution via registry -- Phase 8 (AI Surface)
- Keyboard shortcuts wired to commands -- Phase 10 (Polish)

</deferred>

## Testing Requirements (AX)

All new functionality in this phase MUST include:
- **Unit tests** for all new functions/methods (mock external deps)
- **Integration tests** for all new API endpoints, DB operations, and service integrations
- **Scenario tests** for all new user-facing workflows

Test naming: `Test<Component>_<Behavior>[_<Condition>]`
Reference: TEST_GUIDE.md for requirement mapping, .claude/ax/references/testing-pyramid.md for methodology

---

*Phase: 05-command-hub*
*Context gathered: 2026-03-10*
