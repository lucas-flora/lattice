# Phase 4: Rendering - Research

**Completed:** 2026-03-10
**Status:** Ready for planning

## Codebase Analysis

### Existing Assets
- `src/lib/three-dispose.ts` — `disposeObject()` and `disposeRenderer()` already implemented and tested
- `src/engine/rule/Simulation.ts` — High-level facade: `new Simulation(preset)` creates Grid + RuleRunner
- `src/engine/grid/Grid.ts` — `getCurrentBuffer(name)` returns Float32Array, `indexToCoord(i)` returns [x,y,z]
- `src/engine/preset/schema.ts` — `VisualMappingSchema` validates property/channel/mapping
- `src/store/viewStore.ts` — zoom, cameraX, cameraY already defined
- `src/store/simStore.ts` — generation, isRunning, activePreset, gridWidth, gridHeight
- `src/engine/cell/types.ts` — `CHANNELS_PER_TYPE` for property type to channel count mapping
- `src/engine/preset/builtinPresets.ts` — `loadBuiltinPreset()` for test fixtures
- All 6 YAML presets have `visual_mappings` sections already defined

### Integration Points
- `src/app/page.tsx` — Currently shows Worker status widget, needs to mount SimulationViewport
- `src/engine/worker/` — Worker runs ticks but Phase 4 runs Simulation in main thread for simplicity
- `src/renderer/` — Directory planned in Phase 1 structure but does not exist yet

### Key Constraints
- Engine (`src/engine/`) must have zero UI imports — renderer imports FROM engine, never the reverse
- Three.js already in dependencies (v0.183.0) with @types/three
- jsdom environment in vitest.config.mts — Three.js constructors work in tests

## Technical Research

### Three.js InstancedMesh for Grid Rendering
- `InstancedMesh(geometry, material, count)` — single draw call for N instances
- Per-instance transform via `setMatrixAt(index, matrix4)` — position, rotation, scale
- Per-instance color via `setColorAt(index, color)` — requires `material.vertexColors = true` in Three.js r183
- After updating: `instancedMesh.instanceMatrix.needsUpdate = true` and `instancedMesh.instanceColor.needsUpdate = true`
- For hiding cells: set scale to (0,0,0) in the matrix OR reduce `instancedMesh.count`
- PlaneGeometry(1, 1) as base geometry for 2D quads — one shared geometry for all instances

### OrthographicCamera for 2D/1D
- `OrthographicCamera(left, right, top, bottom, near, far)`
- Zoom: adjust frustum by dividing bounds by zoom factor
- Pan: offset camera.position.x/y
- No perspective distortion — ideal for grid visualization
- Zoom to fit: calculate grid bounds, set frustum to encompass with padding

### Zero-Copy Data Path
- `Grid.getCurrentBuffer(propertyName)` returns the raw Float32Array
- Renderer iterates this directly — no intermediate object creation
- For color mapping: lookup table from property value to Color object
- For position: `Grid.indexToCoord(i)` gives [x,y,z] — set in instance matrix

### 1D Spacetime Diagram
- Each generation is a row of cells
- Store history buffer: array of Float32Array snapshots (or ring buffer)
- Instance count = width * historyDepth
- Position: x = cellIndex, y = generationOffset
- Same InstancedMesh path — just different instance positioning logic

### GPU Resource Lifecycle
- WebGLRenderer created on component mount in useEffect
- Scene, Camera, InstancedMesh created once
- On each frame: update instance matrices and colors from engine state
- On unmount: disposeObject(scene), disposeRenderer(renderer)
- Verify: renderer.info.memory.geometries === 0 after dispose

### Visual Mapping Implementation
- Parse `visual_mappings` from PresetConfig at initialization
- Build lookup tables: `{ propertyValue: Color }` for color channel
- Each frame: read buffer, apply mapping, update InstancedMesh
- Supports: color (setColorAt), size (scale in matrix), shape (swap geometry), orientation (rotation in matrix)

## Validation Architecture

### Test Strategy
- Unit tests for VisualMapper: pure logic, no WebGL needed
- Unit tests for LatticeRenderer construction: verify InstancedMesh setup
- Unit tests for pan/zoom math: camera frustum calculations
- Component tests: mount/unmount lifecycle with dispose verification
- The key insight: most renderer logic can be tested as pure math (position calculation, color mapping, zoom math) without needing actual WebGL rendering

### Mock Strategy
- Three.js classes (Scene, Camera, InstancedMesh) work in jsdom — constructors succeed
- WebGLRenderer requires canvas — use mock or jsdom canvas
- Spy on dispose() calls to verify cleanup
- Test visual mappings as pure data transformation: input (buffer values + mapping config) -> output (color/position arrays)

## RESEARCH COMPLETE
