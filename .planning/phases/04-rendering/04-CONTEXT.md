# Phase 4: Rendering - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

The Three.js renderer displays a live simulation in the browser with data-driven visual mappings, zero-copy typed array reads from engine state, smooth pan/zoom, and no GPU memory leaks. Single unified render path for 1D/2D/3D -- no separate renderers.

Requirements: RNDR-01, RNDR-03, RNDR-04, RNDR-05, RNDR-06, RNDR-07, RNDR-11, RNDR-12

</domain>

<decisions>
## Implementation Decisions

### Renderer Architecture
- Direct Three.js API -- no @react-three/fiber (deferred in Phase 1, resolved here as "no")
- Single `LatticeRenderer` class that handles 1D, 2D, and 3D grids via the same code path (RNDR-04)
- InstancedMesh for all cell rendering -- one geometry shared across all cells, instance matrix + color updated per frame (RNDR-01)
- No per-frame object allocation -- InstancedMesh count set at initialization, visibility toggled via scale(0,0,0) or instance count
- OrthographicCamera for 2D and 1D views; PerspectiveCamera deferred to Phase 9 (3D orbit controls)
- Renderer lives in `src/renderer/` directory, separate from engine (engine has zero UI imports)

### Visual Mapping System
- `VisualMapper` class reads `visual_mappings` from PresetConfig and applies them each frame
- Supports 4 channels: color, size, shape, orientation (RNDR-07)
- Color mapping: property value -> hex color lookup from YAML mapping table, applied via InstancedMesh `setColorAt()`
- Size mapping: property value -> scale factor applied to instance matrix
- Shape mapping: property value -> swap geometry (PlaneGeometry for quads, CircleGeometry for circles, custom shapes later)
- Orientation mapping: property value -> rotation in instance matrix
- Mappings are data-driven -- editing `visual_mappings` in YAML changes rendering on next reload without code changes
- Default mapping when none specified: first boolean property -> color (alive=green, dead=black)

### Zero-Copy Data Path
- Renderer reads Float32Array buffers directly from Grid via `grid.getCurrentBuffer(propertyName)` (RNDR-12)
- No intermediate data transformation -- typed array values used directly for visual mapping lookups
- For the main-thread rendering path: Simulation instance lives in main thread for Phase 4 (Worker integration deferred to Phase 5 Command Hub when the engine-store event protocol is established)
- When Worker bridge exists (Phase 5+), transferable ArrayBuffers will carry buffer snapshots

### 1D Spacetime Diagram
- 1D grids render as a "strip view" -- each generation is one row, stacked vertically to form a spacetime diagram (RNDR-03)
- Same InstancedMesh renderer path -- instances arranged in a 2D layout where X = cell position, Y = generation
- Configurable history depth (how many generations to display)
- New generations push older ones up, creating a scrolling spacetime visualization
- Uses the same visual mapping system as 2D grids

### Pan and Zoom
- Smooth pan via mouse drag (left button) on the viewport canvas
- Zoom via mouse wheel with smooth interpolation, supports non-integer zoom levels (RNDR-05)
- "Zoom to fit" function that calculates bounding box of entire grid and sets camera to frame it with padding (RNDR-06)
- Zoom to fit triggered on preset load and available as a callable function
- Pan/zoom state stored in viewStore (cameraX, cameraY, zoom) for persistence across re-renders
- Zoom range: 0.1x to 20x with smooth clamping

### GPU Resource Management
- All geometry, material, and texture explicitly disposed on unmount using `disposeObject()` from `src/lib/three-dispose.ts` (RNDR-11)
- `disposeRenderer()` called on component unmount to release WebGL context
- After unmount + remount, `renderer.info.memory.geometries` must return to 0
- React component (`SimulationViewport`) manages Three.js lifecycle in useEffect with proper cleanup
- Single WebGLRenderer instance per viewport, created on mount, disposed on unmount

### Viewport Component
- `SimulationViewport` React component in `src/components/viewport/SimulationViewport.tsx`
- Takes a container ref, creates WebGLRenderer sized to container
- Handles resize via ResizeObserver
- Renders via requestAnimationFrame loop
- Dark background (#000000) matching the app theme
- No UI chrome in the viewport itself -- controls will be added in Phase 6

### Claude's Discretion
- Exact instance matrix update strategy (dummy matrix reuse vs per-frame allocation)
- Three.js scene graph structure (flat vs grouped by generation for 1D)
- Exact zoom interpolation curve (linear vs eased)
- Whether to use `InstancedBufferAttribute` for colors vs `setColorAt()` API
- Exact spacetime diagram history depth default
- Anti-aliasing settings for WebGLRenderer
- Cell spacing/gap between quads (0 gap vs small gap for grid visibility)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/three-dispose.ts`: `disposeObject()` and `disposeRenderer()` -- ready to use for GPU cleanup
- `src/engine/rule/Simulation.ts`: Facade that creates Grid + RuleRunner from PresetConfig -- renderer will consume this
- `src/engine/grid/Grid.ts`: `getCurrentBuffer(propertyName)` returns Float32Array directly -- zero-copy read path
- `src/engine/grid/Grid.ts`: `indexToCoord(index)` converts flat index to [x,y,z] -- needed for instance positioning
- `src/engine/preset/schema.ts`: `VisualMappingSchema` already defines property/channel/mapping structure
- `src/store/viewStore.ts`: Already has zoom, cameraX, cameraY state -- renderer reads from this
- `src/store/simStore.ts`: Already has generation, isRunning, activePreset, gridWidth, gridHeight
- `src/engine/cell/types.ts`: `CHANNELS_PER_TYPE` mapping for property type -> channel count

### Established Patterns
- Engine is pure TypeScript, zero UI imports -- renderer must import from engine but engine never imports from renderer
- Test naming: `Test<Component>_<Behavior>[_<Condition>]`
- Tests co-located in `__tests__/` directories
- Zustand stores use `subscribeWithSelector` middleware
- PresetConfig type inferred from Zod schema -- type-safe preset access

### Integration Points
- `src/app/page.tsx`: Currently shows Worker status -- will be replaced with SimulationViewport
- `src/engine/worker/simulation.worker.ts`: Currently runs ticks in Worker -- Phase 4 runs Simulation directly in main thread for simplicity, Worker integration in Phase 5
- `src/engine/preset/builtinPresets.ts`: `loadBuiltinPreset()` loads preset by name -- renderer tests can use this
- Visual mappings already in all 6 built-in YAML presets (conways-gol, rule-110, etc.)

</code_context>

<specifics>
## Specific Ideas

- Conway's Game of Life must render visually with colored instanced quads -- green for alive, black for dead (per its YAML visual_mappings)
- Rule 110 spacetime diagram must use the SAME Three.js renderer path, not a separate 2D canvas or renderer
- The visual mapping system is the key differentiator -- changing YAML visual_mappings must change rendering without code changes
- Success criteria #5 is explicit about GPU memory: `renderer.info.memory.geometries` returns to 0 after unmount/remount
- For Phase 4, the simulation runs directly in the main thread (no Worker complexity) -- the page creates a Simulation instance, ticks it, and the renderer reads the buffers directly

</specifics>

<deferred>
## Deferred Ideas

- @react-three/fiber adoption -- resolved as "no" for Phase 4, direct Three.js preferred for control over dispose lifecycle
- 3D grid rendering with perspective camera and orbit controls -- Phase 9
- Multi-viewport system -- Phase 9
- Worker-to-renderer data bridge via transferable ArrayBuffers -- Phase 5 (Command Hub establishes event protocol)
- Fullscreen mode per viewport -- Phase 9
- Cell drawing/interaction on the viewport -- Phase 6 (Surfaces)
- Performance optimization for large grids (512x512) -- Phase 10

</deferred>

<testing>
## Testing Requirements

### Test Tiers
1. **Unit tests** -- Test VisualMapper logic, color mapping, instance update calculations in isolation (no WebGL needed)
2. **Unit tests with jsdom** -- Test SimulationViewport component mount/unmount lifecycle, dispose verification
3. **Scenario tests** -- Test full preset load -> render -> verify visual output pipeline

### Phase 4 Test Coverage Requirements
- **VisualMapper color mapping**: Property value maps to correct hex color from YAML mapping
- **VisualMapper size mapping**: Property value maps to correct scale factor
- **VisualMapper shape mapping**: Property value selects correct geometry
- **VisualMapper orientation mapping**: Property value maps to correct rotation
- **VisualMapper data-driven**: Changing visual_mappings in preset config changes output
- **Renderer initialization**: LatticeRenderer creates InstancedMesh with correct instance count for grid size
- **Renderer 2D layout**: 2D grid cells positioned at correct (x,y) coordinates
- **Renderer 1D spacetime**: 1D grid renders generations as stacked rows
- **Zero-copy read**: Renderer reads directly from Grid.getCurrentBuffer() without copying
- **Pan/zoom**: Camera position and zoom level update correctly
- **Zoom to fit**: Camera frames entire grid with correct bounds
- **GPU dispose**: After disposeObject(), renderer.info.memory.geometries === 0
- **Component lifecycle**: SimulationViewport mounts and unmounts without leaks

### Test Naming Convention
Use semantic names: `Test<Component>_<Behavior>[_<Condition>]`
- Good: `TestVisualMapper_MapsColorFromYaml`, `TestLatticeRenderer_CreatesInstancedMesh_For2DGrid`, `TestViewport_DisposesOnUnmount`
- Bad: `TestRenderer`, `TestColors`, `TestShouldWork`

</testing>

---

*Phase: 04-rendering*
*Context gathered: 2026-03-10*
