# Node-Based Visual Scripting Editor

## Overview

The node editor is a visual authoring surface for ExpressionTag code. Nodes compile to Python — the graph is a view, not a runtime. The existing expression harness executes the generated code unchanged.

## Architecture Decisions

1. **React Flow (`@xyflow/react`), not from scratch.** Handles zoom, pan, edge routing, hit testing, minimap. ~45kB gzipped, lazy-loaded. Lattice graphs are 5–50 nodes; DOM rendering is fine.

2. **`@nodegraph` comment for round-trip.** Full bidirectional Python↔nodes is intractable. The graph is embedded as a JSON comment in generated code. Hand-written code degrades to "Code Only" mode.

3. **`nodeGraph` on ExpressionTag.** Same pattern as `linkMeta` — optional metadata on the tag. No new store. The tag remains the primitive; the node graph is an authoring view.

4. **Center zone via LayoutRenderer.** The center column uses the existing recursive LayoutNode tree system instead of hardcoded viewports. Default: TabsNode with viewport + node editor.

5. **One-way-primary compilation.** Graph→Code is canonical. Code view is secondary/read-only by default. Users can detach and edit code directly, but this breaks the graph connection (with clear UX).

## Node Type Catalog

| Category | Nodes |
|----------|-------|
| **Property** | PropertyRead, PropertyWrite, Constant, Time |
| **Math** | Add, Subtract, Multiply, Divide, Negate, Abs, Power, Sqrt, Modulo, Sin, Cos, Floor, Ceil |
| **Range** | RangeMap, Clamp, Smoothstep, Linear |
| **Logic** | Compare, And, Or, Not, Select (np.where) |
| **Utility** | Random, Wiggle, Sum, Mean, Max, Min, Count, Coordinates |

## Port Types

| Type | Color | Description |
|------|-------|-------------|
| `scalar` | green-400 | Single numeric value |
| `array` | blue-400 | Grid-sized float array |
| `bool` | amber-400 | Boolean / mask array |
| `string` | zinc-400 | String identifier |

## Compilation Model

1. Topological sort of nodes by edges
2. Each node emits a Python code fragment via `compile(inputExprs, data)`
3. Temp variables: `_n{id}` per node
4. PropertyWrite nodes emit `self.{prop} = _n{id}`
5. Collect `inputs[]` from PropertyRead addresses, `outputs[]` from PropertyWrite addresses
6. Generated code includes `# @nodegraph: {json}` comment for round-trip
7. Code feeds into the existing expression harness unchanged

## Round-Trip Strategy

- **Opening a tag:** Parse `@nodegraph` comment first → instant round-trip
- **Hand-written code (no `@nodegraph`):** Show "Code Only" mode with option to attempt conversion via pattern matching
- **Pattern matcher recognizes:** `self.X = Y`, `cell['X']`, `env['X']`, `rangeMap(...)`, `clamp(...)`, `np.where(...)`, arithmetic ops, numpy functions
- **Unrecognized fragments:** → generic "Python Expression" node with code textarea

## Sync Modes

| Status | Indicator | Meaning |
|--------|-----------|---------|
| In sync | Green dot | Graph and code match |
| Code edited | Yellow dot | Code was modified outside the graph |
| Code only | Gray dot | No nodeGraph, showing raw code |

## File Structure

```
src/engine/nodes/
  types.ts              — NodeGraph, NodeInstance, Edge, PortDefinition, NodeTypeDefinition
  NodeTypeRegistry.ts   — Registry with compile functions per node type
  NodeCompiler.ts       — compileNodeGraph() → { code, inputs, outputs }
  NodeDecompiler.ts     — Parse @nodegraph comment + pattern matcher fallback
  builtinNodes.ts       — All node type definitions
  autoLayout.ts         — Dagre layout wrapper
  index.ts              — Barrel exports
  __tests__/            — Unit tests

src/components/nodes/
  NodeEditorCanvas.tsx   — React Flow wrapper with providers
  CustomNode.tsx         — Dark zinc-800 card with typed port handles
  CustomEdge.tsx         — Bezier curves, color-coded by port type
  PortHandle.tsx         — Small colored circles with type validation
  AddNodeMenu.tsx        — Right-click / Tab to open, searchable, categorized
  NodeEditorToolbar.tsx  — Compile, auto-layout, zoom-to-fit, tag selector
  CodePreview.tsx        — Read-only Python code display
  NodeEditorWithCode.tsx — Split view: graph + code
  SyncStatus.tsx         — Sync indicator component
  CodeEditor.tsx         — Editable code textarea
  nodeTheme.ts           — Shared colors/styles

src/components/panels/
  NodeEditorPanel.tsx    — Panel shell registered in PanelRegistry

src/commands/definitions/
  node.ts                — node.* commands (compile, addNode, removeNode, etc.)
```

## Commands

| Command | Params | Description |
|---------|--------|-------------|
| `node.compile` | `{ tagId }` | Force recompile from nodeGraph |
| `node.addNode` | `{ tagId, type, position?, data? }` | Add node to graph |
| `node.removeNode` | `{ tagId, nodeId }` | Remove node |
| `node.connect` | `{ tagId, source, sourcePort, target, targetPort }` | Add edge |
| `node.disconnect` | `{ tagId, edgeId }` | Remove edge |
| `node.openEditor` | `{ tagId? }` | Open/focus node editor panel |
| `node.autoLayout` | `{ tagId }` | Auto-arrange nodes using dagre |

## Integration Points

- **ExpressionTag:** `nodeGraph?: NodeGraph` field (optional, like `linkMeta`)
- **tag.edit command:** Accepts `nodeGraph` in patch
- **YAML serializer:** Handles `nodeGraph` section on TagV2
- **EventBus:** Subscribe to `tag:updated` / `tag:removed` for external sync
- **KeyboardShortcutManager:** `E` hotkey toggles to node editor tab
- **Center zone:** TabsNode default with viewport + node editor
