# Testing Requirements (AX)

Every feature implementation MUST include tests at all three tiers:

## Test Tiers
1. **Unit tests** — Test individual functions/methods in isolation. Mock external dependencies.
2. **Integration tests** — Test component interactions with real services via docker-compose.test.yml.
3. **Scenario tests** — Test full user workflows end-to-end.

## Test Naming
Use semantic names: `Test<Component>_<Behavior>[_<Condition>]`
- Good: `TestGridEngine_InitializeWithPingPong`, `TestFullSimulationTickFlow`
- Bad: `TestShouldWork`, `Test1`, `TestGivenUserWhenLoginThenSuccess`

## Reference
- See `TEST_GUIDE.md` for requirement-to-test mapping
- See `.claude/ax/references/testing-pyramid.md` for full methodology
- Every requirement in ROADMAP.md must map to at least one scenario test

## Phase 10: Polish — Testing Requirements
- **GUIP-02** Parameter graphs: unit tests for data sampling, graph data updates; integration tests for live update during simulation
- **GUIP-03** HUD menus: unit tests for contextual menu rendering and keyboard shortcut display
- **GUIP-04** Hotkeys: unit tests for KeyboardShortcutManager mapping; integration tests for command execution via hotkey
- **GUIP-05** Screenshot: unit tests for canvas-to-PNG export; integration test for viewport.screenshot command
- **GUIP-06** RAG docs: unit tests for document structure; integration test for seed script document count
- **GUIP-07** Performance: unit test documenting measured frame times for Gray-Scott 512x512

## Frontend Design
- **Theme**: Dark (zinc-900/zinc-800 backgrounds, zinc-300/400 text, green-400/500 accents) consistent with existing HUD/ControlBar
- **Parameter Graphs**: Sparkline-style mini-charts in ParamPanel using canvas 2D context. Ring buffer of last 200 samples. Show live cell count and generation rate (ticks/sec). Monochrome green (#4ade80) on transparent background.
- **HUD Contextual Menus**: Extend HUD with a hotkey legend overlay toggled via `?` key. Show command name and shortcut in a two-column layout. Semi-transparent zinc-900/95 backdrop.
- **Keyboard Shortcuts**: Space=play/pause, N=step, B=step-back, R=reset, C=clear, T=terminal, P=params, F=fullscreen, S=split, ?=hotkey help. Displayed as `kbd` elements with zinc-700 background and zinc-300 text.
- **Screenshot Button**: Camera icon in ControlBar, triggers canvas.toDataURL('image/png') and downloads via anchor click.
- **Typography**: font-mono throughout for data display. tabular-nums for counters.
