# Phase 2: Substrate - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The grid engine (1D, 2D, 3D), Cell Property System, and YAML preset schema form a stable, tested foundation that all other components depend on. The YAML schema is formally versioned before any preset is written.

Requirements: GRID-01, GRID-02, GRID-03, GRID-04, GRID-05, CELL-01, CELL-02, CELL-03, CELL-04, CELL-05, CELL-06, YAML-01, YAML-02, YAML-03

</domain>

<decisions>
## Implementation Decisions

### Grid Engine Architecture
- Single `Grid` class/abstraction that handles 1D, 2D, and 3D via a unified typed array backing store
- All cell state stored as `Float32Array` -- no plain JS objects for cell state (GRID-01 requirement)
- Ping-pong double buffering: two Float32Arrays (`current` and `next`), swap references after each tick -- no data copy (GRID-05)
- Grid dimensions stored as `{ width: number, height: number, depth: number }` where 1D uses height=1/depth=1, 2D uses depth=1
- Flat index calculation: `index = x + y * width + z * width * height` for all dimensionalities
- Each cell can have multiple properties (channels), stored as interleaved or separate arrays -- separate Float32Arrays per property for cache-friendly access during rule evaluation
- Grid topology: `toroidal` (wrap-around) and `finite` (edges are dead/zero) at minimum (GRID-04)
- Neighbor calculation is topology-aware: toroidal wraps with modular arithmetic, finite clamps or returns null
- Neighbor lists: Moore neighborhood for 2D (8 neighbors), von Neumann option, 1D has 2 neighbors (left/right), 3D has 26 neighbors (Moore) or 6 (von Neumann)
- Grid is pure TypeScript with zero browser API dependencies -- all testable in Node.js

### Cell Property System
- A `CellPropertyDefinition` describes a single property: name, type (bool/int/float/vec2/vec3/vec4), default value, and optional I/O role
- Static properties are typed values stored directly in the grid's Float32Array channels
- Computed properties have a `compute` function that takes inputs (own state + neighbor states) and returns a value -- this is the hook point for rule evaluation
- Properties declare `role: 'input' | 'output' | 'input_output'` for composable pipeline behavior (CELL-04)
- A `CellPropertyRegistry` holds all property definitions for a given simulation configuration
- User-defined properties use the exact same `CellPropertyDefinition` interface -- no built-in privilege (CELL-06)
- Bool properties stored as 0.0/1.0 in Float32Array, int as float with Math.round on read
- Vec2/vec3/vec4 occupy consecutive channels in the property array

### YAML Preset Schema
- Schema version `"1"` -- string, not number. Must be present in every preset file (YAML-01)
- Zod schema validates the full structure with typed errors on failure
- Top-level sections: `schema_version`, `meta`, `grid`, `cell_properties`, `rule`, `visual_mappings`, `ai_context`
- `meta`: `{ name: string, author?: string, description?: string, tags?: string[] }`
- `grid`: `{ dimensionality: '1d' | '2d' | '3d', width: number, height?: number, depth?: number, topology: 'toroidal' | 'finite' }`
- `cell_properties`: array of `{ name: string, type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4', default: number | number[], role?: 'input' | 'output' | 'input_output' }`
- `rule`: `{ type: 'typescript', compute: string }` -- the compute field holds a function body string that gets compiled to a function. WASM rules deferred to Phase 7.
- `visual_mappings`: `{ property: string, channel: 'color' | 'size' | 'shape' | 'orientation', mapping: object }` -- schema defined now, renderer consumes in Phase 4
- `ai_context`: `{ description?: string, hints?: string[] }` -- optional, for AI assistant in Phase 8
- Preset loader: parse YAML string -> validate with Zod -> return typed `PresetConfig` object or throw typed error
- Use `yaml` npm package for YAML parsing, `zod` for schema validation -- both already in dependencies

### Computed Property DSL Boundary
- Computed functions in YAML are JavaScript function body strings, NOT a custom DSL
- Function body receives a context object: `{ cell, neighbors, grid, params }` where `cell` is the current cell's properties, `neighbors` is the neighbor array, `grid` gives dimensions/topology, and `params` provides static parameters
- Compiled via `new Function()` in the engine -- sandboxing deferred (out of scope for v1, noted in REQUIREMENTS.md Out of Scope)
- This resolves the Phase 2 blocker noted in STATE.md: "Computed property DSL boundary decision (JS vs WASM evaluation)"
- TypeScript type stubs provided for authoring computed functions with autocomplete

### Claude's Discretion
- Exact Float32Array memory layout optimization (interleaved vs separate arrays per property)
- Neighbor list caching strategy (pre-compute once vs compute on access)
- Whether to use a class-based or functional API for Grid
- Exact Zod schema refinements and custom error messages
- Internal naming conventions for grid methods

</decisions>

<specifics>
## Specific Ideas

- The grid must handle 512x512 efficiently -- this is explicit in the success criteria. Float32Array for a 512x512 grid with 1 property = 262,144 floats = ~1MB. With ping-pong = ~2MB. This is well within budget.
- Ping-pong buffer swap must be a reference swap (swap `current` and `next` pointers), not a data copy -- critical for performance.
- Success criteria explicitly require: "no cell state leaks between buffers" -- test must verify that writing to `next` does not affect `current` during the same tick.
- 1D and 3D grids must "return correct neighbor lists" without touching any browser API -- pure math, pure TypeScript.
- YAML validation must produce "a typed Zod error describing exactly which field is invalid" -- not generic "validation failed."

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/engine/core/types.ts`: Already has `GridDimensions`, `GridTopology`, `GridDimensionality`, `SimulationConfig` types -- extend these, don't replace
- `src/engine/worker/protocol.ts`: Pure function pattern (`handleMessage(msg, state) -> [response, newState]`) -- follow this same pure-function testability pattern for grid operations
- `yaml` and `zod` packages already in `package.json` dependencies

### Established Patterns
- Test naming: `Test<Component>_<Behavior>[_<Condition>]` (from Phase 1 tests)
- Tests co-located with source: `__tests__/` directories alongside source files
- vitest.config uses jsdom environment, globals enabled, include pattern `**/__tests__/**/*.test.ts`
- Pure function extraction for testability (see protocol.ts pattern)
- TypeScript strict mode with explicit return types

### Integration Points
- `src/engine/core/types.ts` -- extend `SimulationConfig` with full preset schema types
- `src/engine/cell/index.ts` -- currently empty, will hold Cell Property System
- `src/engine/preset/index.ts` -- currently empty, will hold YAML loader and Zod schema
- `src/engine/core/index.ts` -- will need to re-export new grid types
- `vitest.config.mts` -- test include pattern already covers `__tests__` directories

</code_context>

<deferred>
## Deferred Ideas

- WASM rule execution for computed properties -- Phase 7 (WASM Acceleration)
- SharedArrayBuffer for zero-copy grid data sharing -- Phase 7
- Computed function sandboxing -- explicitly out of scope per REQUIREMENTS.md
- Visual mapping renderer consumption -- Phase 4 (Rendering)
- AI context field usage -- Phase 8 (AI Surface)
- Built-in preset YAML files (Conway's GoL, Rule 110, etc.) -- Phase 3 (Rule Engine)

</deferred>

<testing>
## Testing Requirements

### Test Tiers (All Three Required)
1. **Unit tests** -- Test grid, cell property, and YAML validation in isolation. Located in `src/engine/` alongside source.
2. **Integration tests** -- Test preset loading end-to-end (YAML string -> validated config -> grid initialization). Located in `test/integration/`.
3. **Scenario tests** -- Test full substrate workflow: load preset YAML, initialize grid with properties, verify correct state. Located in `test/scenarios/`.

### Phase 2 Test Coverage Requirements
- **2D Grid initialization**: 512x512 Float32Array with ping-pong buffers, no state leaks between buffers
- **1D Grid neighbors**: Correct neighbor lists for toroidal and finite topologies
- **2D Grid neighbors**: Moore and von Neumann neighborhoods, toroidal wrap-around
- **3D Grid neighbors**: 26-neighbor Moore neighborhood, correct indices
- **Grid topology**: Toroidal wrap-around vs finite edge behavior
- **Cell property definition**: Static params (bool, int, float) compile and store correctly
- **Cell property computed**: Computed function evaluates with correct context
- **Cell property I/O roles**: Input/output declarations work
- **User-defined properties**: No distinction from built-in ones
- **YAML schema validation**: Valid preset passes, missing fields produce typed errors
- **YAML schema_version**: Must be present and equal to "1"
- **YAML full schema**: All sections (meta, grid, cell_properties, rule, visual_mappings, ai_context) validate
- **Preset loader**: YAML string -> PresetConfig object round-trip

### Test Naming Convention
Use semantic names: `Test<Component>_<Behavior>[_<Condition>]`
- Good: `TestGrid2D_InitializesWithPingPong`, `TestCellProperty_ComputedFunctionEvaluates`, `TestYamlSchema_MissingFieldProducesTypedError`
- Bad: `TestGrid`, `TestYaml`, `TestShouldWork`

</testing>

---

*Phase: 02-substrate*
*Context gathered: 2026-03-10*
