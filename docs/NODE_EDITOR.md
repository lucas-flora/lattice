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
3. **Inlining:** Single-use expressions are inlined — no temp vars. Multi-use nodes get readable variable names
4. ObjectNode outputs read from object (`cell['prop']`), ObjectNode inputs write to object (`self.prop = expr`)
5. Collect `inputs[]` from read addresses, `outputs[]` from write addresses
6. `nodeGraph` is stored on the tag separately (not embedded in code)
7. Code feeds into the existing expression harness unchanged

### Clean Output Examples

Simple comparison: `ObjectNode(alpha) → Compare(> 0) → ObjectNode(alive)`
```python
self.alive = (cell['alpha'] > 0)
```

Range mapping: `ObjectNode(age) → RangeMap(0,20,1,0) → ObjectNode(alpha)`
```python
self.alpha = ((cell['age'] - 0) / (20 - 0) * (0 - 1) + 1)
```

When a node's output feeds multiple consumers, a named temp var is emitted:
```python
age = cell['age']
self.alpha = ((age - 0) / (20 - 0) * (0 - 1) + 1)
self.colorR = age / 100
```

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

## Object Nodes (v2)

C4D-style nodes that represent an entire scene object (cell type, environment, or globals)
with separate input and output property columns.

### Data Model

```ts
interface ObjectNodeData {
  objectKind: 'cell-type' | 'environment' | 'globals';
  objectId: string;          // cell type ID, 'env', or 'globals'
  objectName: string;        // display name
  enabledInputs: string[];   // property names with input ports
  enabledOutputs: string[];  // property names with output ports
  availableProperties: Array<{ name: string; portType: PortType }>;
}
```

Port IDs: `in_{propName}` for inputs, `out_{propName}` for outputs.

### Visual Layout

```
┌─────────────────────────────────┐
│  ● Default Cell                 │  ← cyan-400 header
├────────────────┬────────────────┤
│   INPUTS       │      OUTPUTS   │
│ ○ alive        │     alive ○    │  ← enabled = colored handle
│ ○ age          │       age ○    │
│   colorR       │    colorR ○    │  ← disabled = dimmed, no handle
│   colorG       │                │
├────────────────┴────────────────┤
│  [Show all properties]          │
└─────────────────────────────────┘
```

### Compilation

ObjectNode is special-cased in NodeCompiler:
- **Enabled outputs (right side):** READ from object — emit `cell['{prop}']` or named var if multi-use
- **Enabled inputs (left side):** WRITE to object — emit `self.{prop} = {incomingExpr}`
- Properties tracked in `inputs[]`/`outputs[]` for tag declarations
- Self-connections blocked (`isValidConnection` rejects same-node wiring)

### Scene Data Resolution

`sceneDataResolver.ts` enumerates available objects from stores:
- **Cell types:** from `simStore.cellTypes` or `simStore.cellProperties`
- **Environment:** from `simStore.paramDefs`
- **Globals:** from `scriptStore.globalVariables`

### Add-Node Menu (Hierarchical)

```
Objects ▸
  Cell Types ▸
    Default Cell → adds ObjectNode
    Organism     → adds ObjectNode
  Environment    → adds ObjectNode
  Globals        → adds ObjectNode
Math ▸
  Add, Subtract, ...
Range ▸
  ...
Logic ▸
  ...
Utility ▸
  ...
Property (advanced) ▸
  Read Property, Write Property, Constant, Time
```

Search flattens all items and matches object names + node labels.

### Per-Tag Editor Tabs

Each tag opens in its own dedicated node editor tab:
- `ui.toggleNodeEditor({ tagId })` creates a new tab labeled `Nodes: {tagName}`
- Dynamic tabs are closable (close button on hover)
- Opening from PropertyRow, TagRow, or TagAddForm all use the same mechanism
- Opening from a property's `+ Nodes` button seeds the canvas with an ObjectNode for that property
- Tab contents stay mounted when switching tabs (state preserved without compiling)

### Panel State Persistence

`selectedTagId` is persisted to the panel's `config` in the layout tree via
`layoutStoreActions.updatePanelConfig(panelId, { tagId })`. Survives tab switches
and supports multiple node editor panels with independent tag bindings.

### Expression Execution Order

When multiple post-rule expressions exist, each expression's output is propagated
back to the `cell` dict before the next expression runs. This means expression B
can read expression A's result within the same tick (e.g., `alive` can depend on
`alpha`'s computed value).

### Cache Invalidation

- **Tag code/phase edits:** Full cache invalidation from frame 0 + reset to start state
- **Disabled tag edits:** No cache invalidation (tag isn't affecting output)
- **Metadata-only edits (name, nodeGraph):** No cache invalidation
- **Tag enable:** Full invalidation (tag starts affecting output)
- **Tag disable:** Full invalidation (tag stops affecting output)
- **Removing a disabled tag:** No cache invalidation

### Future: Drag and Drop

Not yet implemented:
- Drag cell card from CardView → drop on canvas → ObjectNode
- Drag property item → ObjectNode with single property exposed
- Drag property onto existing ObjectNode left/right side → add to inputs/outputs

## Integration Points

- **ExpressionTag:** `nodeGraph?: NodeGraph` field (optional, like `linkMeta`)
- **tag.edit command:** Accepts `nodeGraph` in patch
- **YAML serializer:** Handles `nodeGraph` section on TagV2
- **EventBus:** Subscribe to `tag:updated` / `tag:removed` for external sync
- **KeyboardShortcutManager:** `E` hotkey toggles to node editor tab
- **Center zone:** TabsNode default with viewport + node editor
