# Phase 6: Surfaces - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

All simulation controls, the CLI terminal, and primary GUI panels are wired to the CommandRegistry simultaneously -- no feature ships to GUI without also shipping to CLI. This is the first phase where a human can actually use the app.

Requirements: CTRL-01, CTRL-02, CTRL-03, CTRL-04, CTRL-05, CTRL-06, CTRL-08, TERM-01, TERM-02, TERM-03, TERM-04, TERM-05, TERM-06, GUIP-01

</domain>

<decisions>
## Implementation Decisions

### Simulation Controls (CTRL-01, CTRL-02, CTRL-03, CTRL-06)
- Play/pause/step-forward controls rendered as a horizontal toolbar at the bottom-center of the viewport area
- Buttons use monospace icon labels (unicode symbols: play triangle, pause bars, step arrow, reset arrow) -- no icon library dependency
- Speed control: horizontal slider with discrete FPS values (1, 5, 10, 30, 60) plus "max" mode that removes the tick interval entirely (requestAnimationFrame-driven)
- Forward step already exists as `sim.step`. Add `sim.stepBack` command that calls undo to reverse one generation (reverse-step = undo the last tick's diff). This requires capturing tick diffs in CommandHistory before each tick.
- Pattern reset (`sim.reset`) returns to initial state; Clear (`sim.clear`) zeroes the grid -- both are separate buttons and CLI commands
- All buttons invoke commands through CommandRegistry: `sim.play`, `sim.pause`, `sim.step`, `sim.stepBack`, `sim.reset`, `sim.clear`
- Add `sim.speed` command: `{ fps: number }` param (0 = max speed)
- CLI equivalents: `sim play`, `sim pause`, `sim step`, `sim step-back`, `sim reset`, `sim clear`, `sim speed 30`

### Timeline Scrubber (CTRL-04)
- Horizontal scrubber bar below the simulation controls toolbar
- Shows playhead position within recorded history (generation range)
- Dragging the scrubber triggers `sim.seek` command with target generation
- History is maintained as a circular buffer of sparse diffs (reusing CommandHistory pattern)
- Scrubber is disabled when history is empty; max scrub range = configured history depth
- CLI: `sim seek <generation>`

### Cell Drawing and Erasing (CTRL-05)
- Left-click draws (sets cell alive/active), right-click erases (sets cell dead/inactive)
- Brush size configurable: 1x1, 3x3, 5x5, 7x7 -- controlled by toolbar dropdown or CLI `edit brush-size 3`
- Each mouse-down to mouse-up stroke is one undoable command (uses CommandHistory.beginCommand/commitCommand)
- Drawing only works when simulation is paused -- auto-pause on first draw, with visual indicator
- Mouse cursor changes to crosshair when in draw mode
- Add `edit.draw` and `edit.erase` commands for CLI: `edit draw <x> <y>`, `edit erase <x> <y>`
- Add `edit.brushSize` command: `edit brush-size <size>`

### Generation Counter and Live Cell Count (CTRL-08)
- HUD overlay in the top-left corner (replacing current minimal HUD)
- Shows: preset name, generation counter (tabular-nums font for stable width), live cell count
- Live cell count computed on each tick by scanning the primary property buffer (count non-zero values)
- Add `liveCellCount` to simStore so the HUD can reactively display it
- Update simStore on each `sim:tick` event with both generation and liveCellCount
- CLI: `sim status` returns current generation, live cell count, running state, active preset

### Terminal Component (TERM-01 through TERM-06)
- Terminal panel slides up from the bottom of the screen, default height ~30% of viewport
- Toggle via backtick key (`) or Ctrl+` keyboard shortcut, or `ui.toggleTerminal` command
- Terminal has three sections: output log (scrollable), command input line, ghost-text overlay
- Output log shows curated app logs: command executions, state changes, errors -- NOT raw console.log
- Log entries are timestamped and color-coded by type: command (cyan), info (gray), error (red), AI (purple)
- Command input follows shell conventions: prompt character `>`, blinking cursor, command history (up/down arrow)
- Ghost-text autocomplete: partial command input shows dimmed completion suggestion, Tab to accept
- Autocomplete is contextual: `sim ` only shows valid subcommands; `preset load ` shows preset names
- Command parsing: split on spaces, first token is command category, second is action, rest are args
- CLI command format maps to dot notation: `sim play` -> `sim.play`, `preset load conways-gol` -> `preset.load { name: "conways-gol" }`
- Non-command input (text that doesn't match any command prefix) is routed to the AI assistant hook
- AI hook returns "AI not connected -- available in a future update" placeholder message until Phase 8
- Terminal built as generic shell infrastructure per TERM-05 -- AI is just a consumer, not structural

### Preset Loading GUI (from GUIP-01 + CTRL-06 context)
- Dropdown selector in the top-right area of the HUD (replacing current GoL/Rule110 buttons)
- Lists all 6 built-in presets by their meta.name from YAML
- Selecting a preset invokes `preset.load` command through registry
- Grid resets to the preset's initial state with appropriate initialization (random seed for 2D, center cell for 1D)
- CLI: `preset load conways-gol`, `preset list` (new command listing available presets)

### Parameter Panel (GUIP-01)
- Side panel on the right edge, toggleable via button or `ui.toggleParamPanel` command
- Shows current preset parameters: grid size, cell properties with current values
- Parameters are read-only in Phase 6 (editing deferred to Phase 10)
- Panel displays: preset name, grid dimensions, topology, cell property definitions
- Collapsible sections for each parameter group

### Page Layout Architecture
- Replace current page.tsx with a proper layout that integrates all surfaces
- Layout: viewport fills center, toolbar at bottom, HUD overlay top-left, preset dropdown top-right
- Terminal slides up from bottom over viewport when open
- Parameter panel slides in from right when open
- All panels use absolute/fixed positioning to overlay the viewport -- viewport always fills 100% of the screen
- React component hierarchy: `<AppShell>` wraps `<SimulationViewport>`, `<ControlBar>`, `<HUD>`, `<Terminal>`, `<ParamPanel>`, `<PresetSelector>`

### App Initialization
- On app mount, create EventBus, SimulationController, register all commands, wire stores
- Load default preset (Conway's GoL) automatically on startup
- SimulationController is a singleton shared across all surfaces
- Store the controller and registry in a React context or module-level singleton accessible to all components

### Claude's Discretion
- Exact animation/transition timings for panel slide-in/out
- Terminal scrollback buffer size
- Exact autocomplete matching algorithm (prefix match vs fuzzy)
- Loading state indicators during preset switching
- Exact color palette for terminal log entries (within dark theme)
- Whether to use CSS transitions or Framer Motion for panel animations (prefer CSS for no extra deps)
- Internal state management for terminal command history depth

</decisions>

<specifics>
## Specific Ideas

- Success criterion #1 is explicit: both GUI buttons and CLI commands like `sim play`, `sim step` must invoke the same CommandRegistry entry -- this is the core Three Surface Doctrine enforcement
- Success criterion #2 requires ghost-text autocomplete that only suggests valid commands given current state -- if sim is playing, `sim play` should not appear in autocomplete
- Success criterion #3 requires each cell edit to be individually undoable via Ctrl+Z -- this means each brush stroke (mouse-down to mouse-up) is one command in the history
- Success criterion #4 requires live updating generation counter and live cell count visible in the HUD
- Success criterion #5 requires all six built-in presets loadable via GUI dropdown or CLI `preset load conways-gol`
- Success criterion #6 requires non-command terminal input to pass through to AI hook point with placeholder response

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/commands/CommandRegistry.ts`: Fully built registry with register/execute/list/get -- all surfaces wire through this
- `src/commands/SimulationController.ts`: Play/pause/step/reset/loadPreset -- needs extension for stepBack, clear, speed, seek
- `src/commands/definitions/`: All 12 commands registered (sim.play/pause/step/reset, preset.load, view.zoom/pan/fit, edit.undo/redo, ui.toggleTerminal/toggleParamPanel)
- `src/commands/wireStores.ts`: EventBus-to-store wiring with cleanup -- extend for new events
- `src/engine/rule/CommandHistory.ts`: Sparse diff undo/redo -- use for cell drawing commands
- `src/engine/core/EventBus.ts`: Typed event emitter -- add new event types for speed changes, cell count updates
- `src/store/simStore.ts`: Generation, isRunning, activePreset -- extend with liveCellCount, speed
- `src/store/uiStore.ts`: isTerminalOpen, isParamPanelOpen -- extend with brushSize, activeToolbar state
- `src/components/viewport/SimulationViewport.tsx`: Current viewport with simulation lifecycle -- refactor to use shared SimulationController instead of local Simulation
- `src/renderer/LatticeRenderer.ts`: InstancedMesh renderer -- expose grid coordinate from screen position for cell drawing
- `src/engine/preset/builtinPresets.ts`: BUILTIN_PRESET_NAMES array and loadBuiltinPreset() -- use for preset list command and dropdown

### Established Patterns
- Engine is pure TypeScript, zero UI imports -- new commands must follow this
- Zustand stores use subscribeWithSelector middleware -- new store fields follow same pattern
- Commands are async, return CommandResult -- new commands follow same interface
- Event dot notation: `sim:tick`, `sim:play` -- new events follow same pattern
- Test co-location: `__tests__/` directories next to source
- Test naming: `Test<Component>_<Behavior>[_<Condition>]`

### Integration Points
- `src/app/page.tsx`: Complete rewrite needed -- new AppShell layout with all surfaces
- `src/app/layout.tsx`: May need metadata updates (title: "Lattice")
- `src/commands/definitions/sim.ts`: Add stepBack, clear, speed, seek commands
- `src/commands/definitions/edit.ts`: Add draw, erase, brushSize commands
- `src/commands/definitions/preset.ts`: Add list command
- `src/commands/SimulationController.ts`: Add stepBack(), clear(), setSpeed(), seek() methods
- `src/engine/core/EventBus.ts`: Add new event types to EngineEventMap
- `src/store/simStore.ts`: Add liveCellCount, speed fields
- `src/store/uiStore.ts`: Add brushSize field
- New components: `src/components/terminal/Terminal.tsx`, `src/components/hud/HUD.tsx`, `src/components/hud/ControlBar.tsx`, `src/components/panels/ParamPanel.tsx`, `src/components/hud/PresetSelector.tsx`

</code_context>

<deferred>
## Deferred Ideas

- Keyboard shortcuts for all major actions -- Phase 10 (Polish)
- Parameter editing in the parameter panel -- Phase 10 (Polish)
- AI assistant in terminal -- Phase 8 (AI Surface)
- Worker-based simulation execution -- Phase 7 (WASM Acceleration)
- Multi-viewport support -- Phase 9 (Advanced Rendering)
- Fullscreen mode per viewport -- Phase 9 (Advanced Rendering)

</deferred>

## Frontend Design

### Theme
- **Dark theme** as default (no light mode toggle)
- Background: `#0a0a0a` (zinc-950)
- Primary text: `#e4e4e7` (zinc-200)
- Secondary text: `#a1a1aa` (zinc-400)
- Accent: `#22c55e` (green-500) for active states and generation counter
- Borders: `#27272a` (zinc-800)

### Layout
- Full-screen viewport (100vw x 100vh), no scrolling
- HUD overlay: top-left, semi-transparent background
- Preset selector: top-right dropdown
- Control bar: bottom-center, horizontal toolbar
- Terminal: slides up from bottom, 30vh default height, resizable
- Parameter panel: slides in from right, 300px width

### Typography
- Font: Geist Mono (already loaded) for all UI text
- Generation counter: `tabular-nums` variant for stable digit width
- Terminal: monospace throughout, 13px base size
- HUD: 12px for labels, 18px for generation counter

### Control Bar Icons (Unicode)
- Play: `\u25B6` (black right-pointing triangle)
- Pause: `\u23F8` (double vertical bar)
- Step Forward: `\u23ED` (next track)
- Step Back: `\u23EE` (previous track)
- Reset: `\u21BA` (anticlockwise open circle arrow)
- Clear: `\u2715` (multiplication X)

### Animations
- Panel slide-in/out: CSS `transition: transform 200ms ease-out`
- No Framer Motion dependency -- pure CSS transitions
- Terminal slide-up: `translateY(100%)` to `translateY(0)`
- Param panel slide-in: `translateX(100%)` to `translateX(0)`

### Terminal Colors
- Command output: `#22d3ee` (cyan-400)
- Info messages: `#a1a1aa` (zinc-400)
- Error messages: `#ef4444` (red-500)
- AI messages: `#a78bfa` (violet-400)
- Prompt character: `#22c55e` (green-500)
- Ghost text: `#52525b` (zinc-600)

## Testing Requirements (AX)

All new functionality in this phase MUST include:
- **Unit tests** for all new functions/methods (mock external deps)
- **Integration tests** for all new API endpoints, DB operations, and service integrations
- **Scenario tests** for all new user-facing workflows

Test naming: `Test<Component>_<Behavior>[_<Condition>]`
Reference: TEST_GUIDE.md for requirement mapping, .claude/ax/references/testing-pyramid.md for methodology

---

*Phase: 06-surfaces*
*Context gathered: 2026-03-10*
