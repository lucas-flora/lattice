# Phase 2: Substrate - Research

**Researched:** 2026-03-10
**Status:** Complete

## Summary

Phase 2 builds the core simulation substrate: Grid engine (1D/2D/3D), Cell Property System, and YAML preset schema with Zod validation. All code is pure TypeScript with zero browser dependencies, testable in Node.js via Vitest.

## Grid Engine

### Typed Array Layout
- Float32Array is the mandatory backing store for all cell state (GRID-01)
- For a 512x512 grid with 1 property: 262,144 elements = ~1MB per buffer
- Ping-pong double buffering requires 2 buffers: `current` and `next`, swapped by reference after each tick
- Flat indexing: `index = x + y * width` for 2D, `index = x + y * width + z * width * height` for 3D
- Multiple properties stored as separate Float32Arrays (one per property) for cache-friendly sequential access during rule evaluation

### Multi-Dimensional Abstraction
- Single Grid class parameterized by dimensionality ('1d', '2d', '3d')
- 1D: width only (height=1, depth=1 internally)
- 2D: width x height (depth=1 internally)
- 3D: width x height x depth
- All dimensions use the same flat index scheme, same typed array backing

### Topology
- Toroidal: wrap-around using modular arithmetic `((x % width) + width) % width` for correct negative modulo
- Finite: out-of-bounds neighbors return -1 index (caller skips) or a configurable boundary value
- Topology affects only neighbor calculation, not storage

### Neighbor Calculation
- 1D: 2 neighbors (left, right)
- 2D Moore: 8 neighbors (all surrounding cells)
- 2D Von Neumann: 4 neighbors (orthogonal only)
- 3D Moore: 26 neighbors
- 3D Von Neumann: 6 neighbors (face-adjacent only)
- Neighbor offsets are static arrays, computed once per grid configuration
- `getNeighborIndices(index: number): number[]` returns flat indices of all valid neighbors

### Ping-Pong Buffer Protocol
- Two Float32Arrays per property: `bufferA` and `bufferB`
- `current` and `next` are references (not copies) pointing to A or B
- After tick: swap references (`[current, next] = [next, current]`)
- Critical invariant: writing to `next[i]` must never affect `current[i]` during the same tick
- Test: write to next, verify current unchanged, swap, verify current now has written value

## Cell Property System

### Property Definition
```typescript
interface CellPropertyDefinition {
  name: string;
  type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4';
  default: number | number[];
  role?: 'input' | 'output' | 'input_output';
  compute?: string; // JS function body for computed properties
}
```

### Type Storage in Float32Array
- `bool`: stored as 0.0 or 1.0
- `int`: stored as float, `Math.round()` on read
- `float`: stored directly
- `vec2`: 2 consecutive array elements
- `vec3`: 3 consecutive array elements
- `vec4`: 4 consecutive array elements

### Channel Count
Each property type has a channel count: bool=1, int=1, float=1, vec2=2, vec3=3, vec4=4. Total channels across all properties determines array size per cell.

### Property Registry
- `CellPropertyRegistry` holds all `CellPropertyDefinition` objects for a configuration
- Calculates total channel count and per-property offsets
- User-defined properties go through exact same code path as built-in ones (CELL-06)
- Registry provides `getPropertyOffset(name: string): number` and `getPropertyChannels(name: string): number`

### Computed Properties
- Function body string from YAML compiled via `new Function('ctx', body)`
- Context object: `{ cell: Record<string, number|number[]>, neighbors: CellView[], grid: GridInfo, params: Record<string, unknown> }`
- Computed properties are evaluated during rule execution (Phase 3), but the compilation and type-checking infrastructure belongs in Phase 2
- No sandboxing in v1 (explicitly out of scope)

## YAML Preset Schema

### Schema Structure
```yaml
schema_version: "1"  # Required, string not number

meta:
  name: string        # Required
  author: string      # Optional
  description: string # Optional
  tags: string[]      # Optional

grid:
  dimensionality: "1d" | "2d" | "3d"  # Required
  width: number                        # Required
  height: number                       # Required for 2d/3d
  depth: number                        # Required for 3d
  topology: "toroidal" | "finite"      # Required

cell_properties:                       # Required, array
  - name: string                       # Required
    type: "bool" | "int" | "float" | "vec2" | "vec3" | "vec4"  # Required
    default: number | number[]         # Required
    role: "input" | "output" | "input_output"  # Optional

rule:                                  # Required
  type: "typescript"                   # Required (only option in Phase 2)
  compute: string                      # Required, JS function body

visual_mappings:                       # Optional, array
  - property: string
    channel: "color" | "size" | "shape" | "orientation"
    mapping: object

ai_context:                            # Optional
  description: string
  hints: string[]
```

### Zod Implementation
- Use `z.object()` with nested schemas
- `schema_version: z.literal("1")` for exact match
- Discriminated union for grid dimensionality to conditionally require height/depth
- Custom error messages via `.describe()` or `z.ZodError` paths
- `z.safeParse()` returns `{ success: false, error: ZodError }` with typed field paths
- Export both the schema and the inferred TypeScript type via `z.infer<typeof PresetSchema>`

### YAML Parsing
- `yaml` npm package (already in dependencies) for YAML->JS object
- Pipeline: `YAML.parse(yamlString)` -> `PresetSchema.safeParse(parsed)` -> typed result or error
- Preset loader function: `loadPreset(yamlString: string): PresetConfig | PresetValidationError`

### Error Reporting
- Zod errors include the exact field path (e.g., `grid.width`, `meta.name`)
- Map Zod errors to user-friendly messages: "Field 'grid.width' is required" or "Field 'schema_version' must be '1'"
- TypeScript type for error: `{ valid: false, errors: Array<{ path: string[], message: string }> }`

## Validation Architecture

### Test Strategy
- All tests run in Node.js (no browser APIs)
- Unit tests co-located with source in `__tests__/` directories
- Integration tests in `test/integration/` test YAML->Grid pipeline
- Scenario tests in `test/scenarios/` test full substrate workflow

### Key Test Cases
1. Grid 2D 512x512: Initialize, verify buffer isolation (success criterion 1)
2. Grid 1D: Neighbor lists for toroidal and finite (success criterion 5)
3. Grid 3D: Neighbor lists without browser API (success criterion 5)
4. Cell property static: bool/int/float storage and retrieval (success criterion 2)
5. Cell property computed: Function compilation and evaluation (success criterion 2)
6. YAML valid: Full schema passes validation with schema_version "1" (success criterion 3)
7. YAML invalid: Missing field produces typed error with exact path (success criterion 4)
8. Preset loader: End-to-end YAML string to PresetConfig

## Dependencies and Integration

### Existing Code to Extend
- `src/engine/core/types.ts`: Extend with Grid, CellProperty, and Preset types
- `src/engine/cell/index.ts`: Implement Cell Property System
- `src/engine/preset/index.ts`: Implement YAML schema and loader
- New: `src/engine/grid/` directory for Grid implementation

### Package Dependencies (Already Installed)
- `yaml`: ^2.0.0 (YAML parsing)
- `zod`: ^3.24.0 (schema validation)
- `vitest`: ^3.0.0 (testing)

### Vitest Configuration
- Current config at `vitest.config.mts` includes `**/__tests__/**/*.test.ts`
- Uses jsdom environment and globals
- No changes needed for Phase 2 tests (all pure TypeScript, no DOM needed)

## RESEARCH COMPLETE
