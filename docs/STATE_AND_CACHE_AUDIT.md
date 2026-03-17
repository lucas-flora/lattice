# State Objects + Cache/Playback Audit

## Problem

The simulation caching and playback system had bugs causing:
1. Initial state lost/corrupted during editing workflows
2. Missing cache invalidation when script/expression commands mutate the tag registry

## Architectural Decision: sceneStore, not SceneGraph instance

State commands and the `syncInitialStateToScene()` method operate on `sceneStore`
(Zustand) directly via `sceneStoreActions` — **not** via a `SceneGraph` class instance
on the controller.

**Why:** The `controller.getSceneGraph` optional method is never assigned at runtime.
The existing `scene.*` commands already follow this pattern: they read/write
`useSceneStore.getState()` and `sceneStoreActions.*`, falling back to store-only
operations when no engine SceneGraph is present. The scene graph in `SceneGraph.ts`
is used for construction (`fromSimulation()`, `fromPresetV2()`) and serialization,
but the live runtime tree lives in sceneStore.

**Pattern to follow:** Any command that reads or writes the scene tree should use
`useSceneStore.getState()` to read and `sceneStoreActions.*` to mutate, then emit
the appropriate `scene:node*` event via EventBus.

---

## Phase 1: Cache Invalidation Bug Fixes

### 1a. script.ts — missing onTagChanged()

| Command | Status | Fix |
|---------|--------|-----|
| `script.add` | FIXED | Added `controller.onTagChanged()` after tag:added emit |
| `script.remove` | FIXED | Added conditional `controller.onTagChanged()` if tag was enabled |
| `script.enable` | FIXED | Added `controller.onTagChanged()` after tagRegistry.enable() |
| `script.disable` | FIXED | Added `controller.onTagChanged()` after tagRegistry.disable() |
| `script.clear` | FIXED | Tracks hadEnabled, calls `controller.onTagChanged()` if any removed tag was enabled |

### 1b. expression.ts — missing onTagChanged()

| Command | Status | Fix |
|---------|--------|-----|
| `expr.set` | FIXED | Added `controller.onTagChanged()` after tag:added emit |
| `expr.clear` | FIXED | Added conditional `controller.onTagChanged()` if existing tag was enabled |
| `expr.clearAll` | FIXED | Tracks hadEnabled, calls `controller.onTagChanged()` if any removed tag was enabled |

### 1c. SimulationController fixes

| Fix | Status | Description |
|-----|--------|-------------|
| editDebounceTimer on preset load | FIXED | Clear timer in loadPreset/loadPresetConfig/loadPresetConfigAsync |
| clear() syncs initialSnapshot | FIXED | After fill(0), sync all property buffers to initialSnapshot |
| onTagChanged() resets playhead | FIXED | After invalidateCacheFrom(0), reset playhead, restore initial, cache frame 0, emit tick |
| Deferred Pyodide epoch check | FIXED | Capture computeEpoch in captureInitialState, check in onReady callback |

### 1d. tag.ts — nodeGraph in affectsOutput

| Fix | Status | Description |
|-----|--------|-------------|
| nodeGraph check | FIXED | Added `p.nodeGraph !== undefined` to affectsOutput in tag.edit |

---

## Phase 2: State Object Data Model + Commands

Six `state.*` commands registered via `src/commands/definitions/state.ts`:

| Command | Behavior |
|---------|----------|
| `state.capture` | Snapshot current grid buffers → new `initial-state` node in sceneStore |
| `state.restore` | Load state node's buffers into grid, pause, reset playhead |
| `state.setInitial` | Mark as initial (clears isInitial on siblings) |
| `state.clearInitial` | Remove initial designation |
| `state.list` | List state nodes with metadata |
| `state.delete` | Remove state node from sceneStore |

Also added:
- `SceneGraph.getInitialStateNode()` helper (for engine-level queries)
- Terminal `PARAM_MAPPINGS` + `ARG_HINTS` for all state commands
- Command count updated to 114

---

## Phase 3: State Object UI

- **StateSection** (`src/components/panels/inspector/StateSection.tsx`): Inspector section for `initial-state` nodes showing dimensions, captured timestamp, "Set as Initial" toggle, Capture Current / Restore / Delete buttons.
- **InspectorPanel**: Dispatches `StateSection` for `INITIAL_STATE` type nodes.
- **SimRootSection**: Added "Capture State" button that creates a new state node under the sim-root.

---

## Phase 4: Wire State Objects as Canonical Initial State

The in-memory `initialSnapshot` (Map<string, Float32Array>) is now synced to the scene
store as an `initial-state` node. On reset, the controller tries the scene store node
first, falling back to the in-memory snapshot.

| Hook point | What happens |
|------------|-------------|
| `captureInitialState()` | After capturing in-memory, calls `syncInitialStateToScene()` |
| `reset()` via `restoreInitialState()` | Reads scene store state node first, falls back to in-memory |
| `onGridEdited()` at gen 0 | Updates in-memory snapshot, then `syncInitialStateToScene()` |
| `clear()` | Zeros all buffers, syncs to in-memory, then `syncInitialStateToScene()` |
| `onTagChanged()` | Invalidates cache from 0, resets playhead, restores initial state, emits tick |

### Controller methods added

- `syncInitialStateToScene()` — Creates or updates the `initial-state` node in sceneStore
- `findInitialStateNode()` — Queries sceneStore for the active initial-state node
- `onStateRestored()` — Called by `state.restore` command after writing buffers to grid

---

## File Summary

| File | Change |
|------|--------|
| `docs/STATE_AND_CACHE_AUDIT.md` | This tracking doc |
| `src/commands/definitions/script.ts` | Add 5 `onTagChanged()` calls |
| `src/commands/definitions/expression.ts` | Add 3 `onTagChanged()` calls |
| `src/commands/SimulationController.ts` | Fix editDebounce, clear(), onTagChanged playhead, epoch check; add state sync methods |
| `src/commands/definitions/tag.ts` | Add nodeGraph to affectsOutput |
| `src/engine/scene/SceneGraph.ts` | Add `getInitialStateNode()` |
| `src/commands/definitions/state.ts` | New: 6 state commands |
| `src/commands/definitions/index.ts` | Register state commands |
| `src/components/terminal/commandParser.ts` | PARAM_MAPPINGS + ARG_HINTS |
| `src/components/panels/inspector/StateSection.tsx` | New: inspector section |
| `src/components/panels/InspectorPanel.tsx` | Wire StateSection |
| `src/components/panels/inspector/SimRootSection.tsx` | "Capture State" button |
