# Phase 9: Advanced Rendering - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-viewport with independent cameras, full 3D grid visualization, reverse playback with timeline scrubbing, and per-viewport fullscreen mode -- all using the existing Three.js renderer path without introducing a second render system.

Requirements: RNDR-02, RNDR-08, RNDR-09, RNDR-10

</domain>

<decisions>
## Implementation Decisions

### Multi-Viewport System (RNDR-08)
- Extend AppShell layout to support a split-viewport arrangement
- Each viewport is an independent `SimulationViewport` instance with its own `CameraController` and `LatticeRenderer`
- All viewports share the same `SimulationController` and read from the same Grid instance (zero-copy buffer reads)
- A `ViewportManager` in uiStore tracks viewport count (1 or 2) and per-viewport camera state
- New command `view.split` toggles between single and split viewport layout
- Layout uses CSS flexbox to arrange viewports side by side (50/50 split)
- Each viewport gets its own RAF loop and independently resizes via ResizeObserver
- Maximum of 2 viewports in v1 (side-by-side layout)

### 3D Grid Rendering (RNDR-02)
- Extend LatticeRenderer to detect `dimensionality: '3d'` and create a `'3d'` render mode
- Use the same InstancedMesh path: `BoxGeometry(1,1,1)` instead of `PlaneGeometry(1,1)` for 3D
- Use `PerspectiveCamera` for 3D viewports instead of `OrthographicCamera`
- Position each voxel at `(x, y, z)` coordinates from `Grid.indexToCoord()`
- Only render non-zero (alive) cells as visible instances to avoid rendering empty voxels
- Instance count dynamically adjusted based on live cell count

### 3D Camera Controls (RNDR-10)
- Create `OrbitCameraController` for 3D viewports wrapping Three.js OrbitControls
- Provides orbit (drag to rotate), zoom (scroll), pan (right-drag or shift+drag)
- Falls back gracefully: 2D grids still use `CameraController` with orthographic camera
- The viewport detects dimensionality from the preset and instantiates the correct camera controller

### Timeline Scrubber (reverse playback)
- Extend the ControlBar with a timeline slider showing generation 0 to current max
- The slider reads from `simStore.generation` for current position and from tick history length for range
- Dragging the scrubber calls `sim.seek` command which already exists in SimulationController
- Visual display updates as fast as possible during scrub -- the renderer reads the restored grid state each frame
- When playing, the scrubber advances automatically

### Fullscreen Mode (RNDR-09)
- Add a fullscreen toggle button to each viewport
- Fullscreen uses the Fullscreen API (`element.requestFullscreen()`) on the viewport container
- When in fullscreen, the HUD and ControlBar are hidden (CSS z-index management)
- Pressing Escape or clicking the toggle again exits fullscreen
- `document.fullscreenchange` event listener manages state transitions
- New `view.fullscreen` command registered in CommandRegistry

### Claude's Discretion
- Exact visual styling of split viewport divider
- Whether 3D voxels get ambient lighting or remain MeshBasicMaterial
- Timeline scrubber animation smoothness and debounce strategy
- Fullscreen transition animations
- Whether to show a mini-map or viewport indicator in split mode
- Exact OrbitControls damping and sensitivity settings

</decisions>

<specifics>
## Specific Ideas

- Success criterion #1: Two viewport panels side by side, independent camera position and zoom, both rendering same simulation live
- Success criterion #2: 3D grid (voxel) renders with orbit controls using same InstancedMesh path as 2D
- Success criterion #3: Drag timeline scrubber backward, simulation state rewinds, visual display keeps up
- Success criterion #4: Toggle fullscreen on any viewport, HUD hides, Escape restores layout

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/LatticeRenderer.ts`: Unified InstancedMesh renderer with `renderMode` detection ('2d' | '1d-spacetime') -- extend with '3d' mode
- `src/renderer/CameraController.ts`: Orthographic camera with pan/zoom/zoom-to-fit -- reuse for 2D, create parallel OrbitCameraController for 3D
- `src/components/viewport/SimulationViewport.tsx`: React component wrapping renderer lifecycle -- refactor to accept viewportId prop for multi-viewport
- `src/components/AppShell.tsx`: Top-level layout with single viewport -- extend to support split layout
- `src/store/uiStore.ts`: UI state store -- extend with viewport count, fullscreen state
- `src/store/viewStore.ts`: View state per viewport -- extend with multi-viewport camera states
- `src/commands/SimulationController.ts`: Already has `seek()` with tick history and bidirectional scrubbing
- `src/commands/definitions/view.ts`: View commands (zoom, pan, fit) -- add `view.split`, `view.fullscreen`
- `src/components/hud/ControlBar.tsx`: Simulation controls -- add timeline scrubber slider
- `src/engine/grid/Grid.ts`: Already supports 3D via `indexToCoord()` returning `[x, y, z]` and `coordToIndex(x, y, z)`
- `src/engine/grid/types.ts`: `GridDimensionality` already includes '3d'

### Established Patterns
- All commands route through `CommandRegistry`
- Zustand stores with `subscribeWithSelector` middleware
- EventBus for engine-to-store communication
- Test co-location in `__tests__/` directories
- Dark theme (bg-zinc-800, text-zinc-300, accent-green) consistent throughout

### Integration Points
- `src/renderer/types.ts`: Add '3d' to `GridRenderMode` union
- `src/renderer/LatticeRenderer.ts`: Add `update3D()` method, PerspectiveCamera support
- `src/renderer/CameraController.ts`: Add OrbitCameraController class
- `src/store/uiStore.ts`: Add `viewportCount`, `fullscreenViewportId` state
- `src/components/AppShell.tsx`: Conditional split layout
- `src/components/hud/ControlBar.tsx`: Timeline scrubber slider
- `src/commands/definitions/view.ts`: `view.split`, `view.fullscreen` commands

</code_context>

<deferred>
## Deferred Ideas

- More than 2 viewports (grid layout) -- Phase 10 or future
- Picture-in-picture viewport mode -- future enhancement
- Viewport-specific rendering settings (wireframe, heatmap) -- future
- 3D cross-section slice views -- future

</deferred>

## Testing Requirements (AX)

All new functionality in this phase MUST include:
- **Unit tests** for all new functions/methods (mock external deps)
- **Integration tests** for all new API endpoints, DB operations, and service integrations
- **Scenario tests** for all new user-facing workflows

Test naming: `Test<Component>_<Behavior>[_<Condition>]`
Reference: TEST_GUIDE.md for requirement mapping, .claude/ax/references/testing-pyramid.md for methodology

## Frontend Design

### Multi-Viewport Layout
- **Split mode**: Two viewports side by side using CSS flexbox, each taking 50% width
- **Divider**: 2px solid zinc-700 border between viewports
- **Viewport headers**: Small overlay at top-left of each viewport showing "Viewport 1" / "Viewport 2" in zinc-500 text
- **Split toggle**: Button in ControlBar with split-screen icon, toggles between single and dual viewport

### Timeline Scrubber
- **Position**: Integrated into ControlBar, appearing between the speed slider and the step controls
- **Styling**: Thin horizontal slider (w-48) with accent-green-500 thumb
- **Labels**: "Gen 0" on left, current max generation on right, in xs font-mono text-zinc-400
- **Behavior**: Smooth drag updates, debounced seek calls, live visual feedback

### Fullscreen Toggle
- **Position**: Small button at top-right corner of each viewport
- **Icon**: Expand arrows icon, zinc-300 hover:white
- **Fullscreen state**: Viewport fills entire screen, all HUD/controls hidden
- **Exit**: Press Escape or click the shrink button (same position)

### 3D Viewport
- **Camera**: PerspectiveCamera with OrbitControls for rotate/zoom/pan
- **Lighting**: Subtle ambient light (0x404040) + directional light for depth perception
- **Voxels**: BoxGeometry(0.9, 0.9, 0.9) with slight gap for visual clarity
- **Background**: Same black background (0x000000) as 2D mode
- **Grid lines**: Optional wireframe grid helper for spatial reference (toggleable)

### Color Scheme (consistent with existing)
- Background: bg-black / bg-zinc-800
- Text: text-zinc-300 / text-zinc-400 / text-zinc-500
- Accents: text-green-400 / accent-green-500
- Borders: border-zinc-700
- Glass panels: bg-zinc-800/90 backdrop-blur-sm

---

*Phase: 09-advanced-rendering*
*Context gathered: 2026-03-10*
