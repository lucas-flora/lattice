# Scene Graph Architecture

> The simulation IS a scoped object tree. This is the north-star spec for the C4D Object Manager model.

---

## Vision

Everything lives in a hierarchy. Tags attach computation to nodes. Panels are filtered views of the tree. Multiple roots enable independent simulations. The toolkit we use to make presets is the toolkit users get.

**Current state (SG-0 through SG-9 complete)**: SceneNode data model with SceneGraph class. SceneStore with selection. Object Manager + Inspector panels. Rule-as-tag (`phase: 'rule'`). Link-as-wizard (creates `source: 'code'` tags with `linkMeta`). Scope resolution walks up ancestors. Multi-sim via SimulationManager. YAML v2 schema with backward compat. Unified Card View replaces purpose-built panels. Numbered drawer layout: 1=ObjMgr+Inspector, 2=Card View (cells), 3=Card View (tags+globals), 4=Metrics.

**Remaining**: Tree is still a derived view (not source of truth yet). Copy semantics (`self.*` adaptation) not wired to UI. Full tree-as-source-of-truth migration (Phase 2 of migration strategy).

---

## The Node Primitive

A `SceneNode` is **one generic data structure**. The `type` field is metadata — a label that tells the UI what icon to show and tells the engine how to treat it. Structurally, every node is the same thing: a named entry in a tree with properties, children, and tags.

```typescript
interface SceneNode {
  id: string;
  type: string;                    // 'sim-root' | 'cell-type' | 'group' | 'environment' | 'globals' | etc.
  name: string;
  parentId: string | null;        // null = world-level
  childIds: string[];             // ordered
  enabled: boolean;
  properties: Record<string, any>; // generic property bag
  tags: string[];                  // IDs of ExpressionTags attached to this node
}
```

What makes a node an "Environment" vs a "CellType" is just its `type` label and what `properties` it carries. The engine interprets `type` to know what to do: `'cell-type'` nodes allocate grid buffers, `'environment'` nodes populate the params map, `'sim-root'` nodes own a Simulation instance. But the data model is one primitive.

This is exactly how C4D works — a Null, a Mesh, a Light are all `BaseObject`. They differ in type tag and what data they carry, but structurally they're the same.

---

## The Tree

```
World (implicit root — not a scene node, just the container)
├── Shared                        (accessible from all sims)
│   └── [shared variables/tags]
├── SimRoot: "Simulation A"       (scope boundary)
│   ├── Environment               (env params: feedRate, killRate, ...)
│   ├── Globals                   (global vars: entropy, ageLimit, ...)
│   ├── CellType: "Base Cell"     (properties: alive, age, alpha, ...)
│   │   ├── [tag: "fade-on-age"]  (expression: alpha = age / 100)
│   │   └── [tag: "death-rule"]   (expression: alive = ...)
│   ├── CellType: "Red Cell"      (extends Base Cell)
│   │   └── [tag: "extra-energy"] (expression: energy -= 0.01)
│   ├── Group: "Visual FX"        (organizational container)
│   │   └── [tag: "glow-effect"]  (shared by children)
│   ├── InitialState              (snapshot for reset)
│   └── [tag: "conways-gol"]      (THE rule — phase: 'rule', on SimRoot)
└── SimRoot: "Simulation B"       (second independent sim)
    ├── Environment               (own params)
    ├── Globals                   (own variables)
    ├── CellType: "Fluid Cell"
    └── [tag: "gray-scott"]       (different rule)
```

---

## Node Types Reference

Every node is the same `SceneNode` struct. The `type` string is metadata that tells the engine + UI how to interpret it:

| Type Label | Engine Interprets As | Properties Bag Contains | Typical Children |
|-----------|---------------------|------------------------|------------------|
| `sim-root` | Scope boundary. Creates a Simulation instance. | gridConfig, presetMeta | environment, globals, cell-types, groups |
| `cell-type` | Allocates grid buffer channels. Defines cell properties. | color, cellProperties[], parentType? | None (leaf) |
| `group` | Organizational container. Shared context for children. | sharedProperties[] | cell-types, other groups |
| `environment` | Populates the params Map for its SimRoot. | paramDefs[] | None (leaf) |
| `globals` | Populates the GlobalVariableStore for its SimRoot. | variableDefs[] | None (leaf) |
| `initial-state` | Snapshot for reset. | snapshotData | None (leaf) |
| `shared` | Above all roots. Globally accessible cross-sim. | variableDefs[] | None (leaf) |

### Type-Specific Property Schemas

**sim-root**:
```typescript
{
  gridWidth: number;
  gridHeight: number;
  gridDepth: number;
  dimensionality: '1d' | '2d' | '3d';
  topology: 'toroidal' | 'finite';
  presetName?: string;
}
```

**cell-type**:
```typescript
{
  color: string;              // hex color
  parentType?: string;        // parent cell type ID
  cellProperties: CellPropertyConfig[];
}
```

**environment**:
```typescript
{
  paramDefs: ParamDef[];
  paramValues: Record<string, number>;
}
```

**globals**:
```typescript
{
  variableDefs: Array<{ name: string; type: string; default: number | string }>;
  variableValues: Record<string, number | string>;
}
```

**group**:
```typescript
{
  sharedProperties?: Record<string, any>;
}
```

**initial-state**:
```typescript
{
  buffers: Record<string, number[]>;   // property name → Float32Array as number[] (serializable)
  width: number;                       // grid width at capture time
  height: number;                      // grid height at capture time
  isInitial: boolean;                  // if true, used as canonical reset state
  capturedAt: string;                  // ISO timestamp
  propertyNames: string[];             // ordered list of captured property names
}
```

State nodes are managed by `state.*` commands and synced automatically by
`SimulationController.syncInitialStateToScene()`. On reset, the controller reads
from the scene store state node first, falling back to the in-memory snapshot.
See `docs/STATE_AND_CACHE_AUDIT.md` for full details.

---

## Tree = Scope

Variables resolve by walking UP the tree until found. A second root = second scope = second independent simulation.

### Resolution Rules

1. Start at the requesting node.
2. Walk up ancestors via `parentId`.
3. At each node, check if the variable is defined in that node's properties.
4. **Stop at SimRoot boundary** — a SimRoot is a scope boundary. Variables from one sim cannot leak to another.
5. **Exception: Shared nodes** — nodes with `type: 'shared'` at world level are accessible from all scopes.
6. **Override semantics**: If the same variable is defined at multiple levels, the closest ancestor wins (child overrides parent).

### Example

```
SimRoot: "Sim A"
├── Globals: { entropy: 0.5 }
├── Group: "FX" { opacity: 0.8 }
│   └── CellType: "Glowing Cell"
│       └── [tag] reads "opacity" → finds 0.8 from Group "FX"
│       └── [tag] reads "entropy" → finds 0.5 from Globals
│       └── [tag] reads "feedRate" → finds value from Environment
└── Environment: { feedRate: 0.055 }
```

---

## Rule = Tag

The rule is not a special engine concept. It's just the ExpressionTag with `phase: 'rule'` on the SimRoot. It's editable, swappable, and disable-able like any other tag.

### How Rule Tags Work

- `phase: 'rule'` signals this tag IS the simulation rule
- Rule tags receive `RuleContext` (neighbors, cell, grid, coords) unlike pre/post tags which receive arrays
- Only one rule tag can be active per SimRoot at a time
- Disabling the rule tag = no-op tick (buffers still swap, but no computation)

### Rule Types

```typescript
{
  phase: 'rule',
  ruleType: 'typescript' | 'wasm' | 'python',
  // TS/WASM rules: code is the compute body, runs in JS
  // Python rules: code runs via Pyodide
}
```

### Built-in Presets as Rule Tags

Built-in presets (Conway's GoL, Gray-Scott, etc.) are pre-written rule tags. Their TS/WASM compute bodies become tag code. Loading a preset creates the rule tag on the SimRoot automatically.

### Rule Editing

```
tag.edit { id: ruleTagId, code: 'new compute body' }
```

This calls `sim.updateRule(newBody)` under the hood. Same as current `rule.edit` but through the tag system.

### Rule Swapping

1. Disable current rule tag
2. Enable a different rule tag (or create a new one)
3. Only one `phase: 'rule'` tag should be enabled per SimRoot

---

## Link = Wizard

Links are a creation wizard, not a tag source type. Only two real tag types: expression (scoped to property) and script (general).

### The Wizard Concept

1. User opens the Link wizard (tab in TagAddForm)
2. Picks source address, target address, range mapping, easing
3. Wizard generates `rangeMap()` Python code
4. Creates a normal `source: 'code'` tag with that generated code
5. `linkMeta` preserved on the tag for fast-path JS resolution

### After Creation

The tag is just code. You can edit the code directly. The link wizard is one way to create a tag — after creation, it's indistinguishable from a hand-written expression (except for `linkMeta` enabling the fast path).

### Fast-Path Preservation

Tags with `linkMeta` (regardless of source) are detected by `isSimpleRangeMap()` and resolve in JS without Pyodide. This preserves the performance benefit of the legacy LinkRegistry.

### Migration

Existing `source: 'link'` tags are migrated to `source: 'code'` with `linkMeta` intact. The `'link'` source type is removed from the union.

---

## Panels as Views

Panels are filtered views of the scene tree, not independent data sources.

| Panel | What It Shows | Drawer | Default Filters |
|-------|---------------|--------|-----------------|
| **Object Manager** | Raw tree — all nodes, hierarchy, expand/collapse | 1 (top) | No filter |
| **Inspector** | Selected node's properties + attached tags | 1 (bottom) | `selectedNode` |
| **Card View** | Filtered cards — cells, env, globals, tags | 2 (cells), 3 (tags+globals) | `defaultFilters` prop |
| **Metrics** | Live sparkline graphs (cell count, tick rate) | 4 | N/A |

### Unified Card View

All "list" panels are the same `CardViewPanel` component with different `defaultFilters`. There are no separate CellPanel, ParamPanel, or ScriptPanel — just filtered Card Views.

- **Multi-select type filters**: Cells, Env, Vars, Tags — toggle multiple simultaneously
- **Collapsible sections**: When multiple types active, each gets a header with count and collapse toggle
- **Per-section + buttons**: Tags section opens TagAddForm, Vars opens VariableAddForm, Cells creates a new cell-type node
- **Rich tag cards**: Full TagRow with expand-to-edit, enable/disable toggle, phase badges, delete
- **Rich variable cards**: Inline value editing, type display, delete
- **Drawer 2** defaults to `['cells']` — shows cell type cards
- **Drawer 3** defaults to `['tags', 'globals']` — shows tag cards with TagRow editing + variable cards with inline editing

### Selection Drives Everything

Clicking a node in the Object Manager:
- Highlights it in the Object Manager
- Shows its details in the Inspector
- If it's a CellType, highlights it in Card View (drawer 2)

### Numbered Drawer Layout

```
` = Terminal (bottom tray)
1 = Object Manager (top ~35%) + Inspector (bottom ~65%), vertically split
2 = Card View, defaultFilters=['cells'] (left)
3 = Card View, defaultFilters=['tags', 'globals'] (right)
4 = Metrics/Charts (far right)
```

Drawers toggle via hotkey (1-4) or commands (`ui.toggleDrawer1` through `ui.toggleDrawer4`). Each supports docked and floating modes. Grips appear at viewport edges when drawers are closed.

---

## Multi-Sim

Multiple SimRoot nodes = multiple independent simulations.

### Architecture

```typescript
class SimulationManager {
  private instances: Map<string, SimulationInstance>;
  private activeRootId: string;

  getInstance(rootId: string): SimulationInstance;
  getActiveInstance(): SimulationInstance;
  setActiveRoot(rootId: string): void;
  addRoot(rootId: string, preset: PresetConfig): SimulationInstance;
  removeRoot(rootId: string): void;
}
```

### Viewport Binding

Each viewport panel gets a `rootId` in its config. The renderer reads from the bound instance's grid. Camera state is per-viewport.

### Command Routing

Commands route to the active root by default. Explicit targeting:
```
sim.play { rootId: 'sim-b' }
```

### Linked Playback

Optional mode where multiple instances share play/pause/speed but maintain independent state (grids, generation counts).

---

## Preset as Full Tree

A preset describes the **complete scene graph** — every object, every property, every tag, every expression. Built-in presets and user presets are structurally identical.

A Conway's GoL preset has:
- One SimRoot
- One Environment (few params)
- One CellType (base cell with alive/age/alpha)
- One rule tag (B3/S23 in TypeScript)

A Navier-Stokes preset has:
- One SimRoot
- Rich Environment (viscosity, diffusion, dt, ...)
- Multiple CellTypes with vector properties (velocity vec2, pressure, divergence)
- Multiple expression tags for visualization
- A complex Python rule tag

The preset YAML fully describes the tree.

---

## Copy Semantics

### `self.*` Adapts

When copying a tag from one owner to another:
- `self.age` on CellType A → `self.age` on CellType B (adapts to new owner)
- `self` resolves to whichever node the tag is attached to

### Absolute References Stay Fixed

- `cell.BaseCell.age` stays as-is regardless of where the tag lives
- `env.feedRate` stays as-is
- `global.myVar` stays as-is

### Group Context Travels

When copying a subtree (group + children), the group's shared context travels with it. Children's `self.*` references still resolve correctly because the relative structure is preserved.

---

## YAML v2 Schema

```yaml
schema_version: "2"

scene:
  - type: sim-root
    name: "Conway's GoL"
    children:
      - type: environment
        params:
          - { name: birthThreshold, type: int, default: 3, min: 1, max: 8 }
      - type: globals
        variables:
          - { name: entropy, type: float, default: 0.0 }
      - type: cell-type
        name: "Base Cell"
        color: "#4ade80"
        properties:
          - { name: alive, type: bool, default: 0 }
          - { name: age, type: int, default: 0 }
          - { name: alpha, type: float, default: 1.0 }
        tags:
          - name: "fade-on-age"
            code: "self.alpha = clamp(1.0 - self.age / 100, 0, 1)"
            phase: post-rule
      - type: initial-state
        data: { ... }
    tags:
      - name: "Conway's GoL Rule"
        code: |
          const alive = ctx.cell.alive;
          const n = ctx.neighbors.filter(n => n.alive === 1).length;
          return { alive: (alive ? (n === 2 || n === 3) : n === 3) ? 1 : 0 };
        phase: rule
        ruleType: typescript

grid:
  width: 256
  height: 256
  topology: toroidal
```

### Backward Compatibility

- v1 presets (`schema_version: "1"` or missing) load through existing `loadPresetOrThrow()` path
- v1 loads build the tree via `SceneGraph.fromSimulation(sim)`
- v2 presets load the tree directly from YAML
- Built-in presets stay v1 until all consumers support v2

---

## Tick Pipeline (Tag Mapping)

```
Per tick:
  0. Resolve pre-rule tags  (phase='pre-rule', JS fast-path for linkMeta tags)
  1. Execute rule tag        (phase='rule', TS/WASM/Python — THE rule)
  2. Swap buffers            (rule output becomes current)
  3. Evaluate post-rule tags (phase='post-rule', Python for code/script)
  4. Run global scripts      (source='script', per-frame Python)
  5. Emit sim:tick
```

Tags within each phase run in dependency order (topological sort on inputs/outputs).

Pre-rule link tags use JS `rangeMap` for speed. The rule tag receives `RuleContext`. Post-rule code tags go through the Pyodide Python harness.

---

## Migration Strategy

### Phase 1: Tree as Derived View

Tree is built from existing flat state via `SceneGraph.fromSimulation(sim)`. The tree is **read-only** — mutations still go through existing commands (`param.set`, `tag.add`, etc.). The tree updates reactively when the underlying state changes.

### Phase 2: Tree as Source of Truth

Tree becomes the canonical data model. Commands mutate the tree directly. The flat stores (simStore, expressionStore, etc.) become derived from the tree. Engine reads from tree nodes instead of flat registries.

### Dual-Write Avoidance

During transition, avoid dual-writing to both tree and flat stores. Instead:
1. Commands write to the authoritative source (flat stores in phase 1, tree in phase 2)
2. The other view is derived/rebuilt automatically
3. No manual sync code that can drift

### Legacy Compatibility

- `TagOwner` types map directly to node types: `'cell-type'` → CellType node, `'environment'` → Environment node, etc.
- Existing `ExpressionTag.owner` is a pointer into the tree (same as `parentId` on the tag)
- `linkStore` and `scriptStore` are deprecated once the tree is source of truth

---

## Glossary

| Term | Definition |
|------|-----------|
| **SceneNode** | The one generic data structure for all objects in the tree. |
| **SimRoot** | A SceneNode with `type: 'sim-root'`. Scope boundary. Owns a Simulation instance. |
| **Scope boundary** | A SimRoot prevents variable resolution from crossing into another simulation. |
| **Tag** | An ExpressionTag attached to a SceneNode. All computation is a tag. |
| **Expression** | A tag with `source: 'code'`, scoped to a property. |
| **Script** | A tag with `source: 'script'`, general-purpose Python. |
| **Rule tag** | A tag with `phase: 'rule'`. THE simulation rule. One per SimRoot. |
| **Wizard** | A creation UI that generates tag code. Links are a wizard, not a source type. |
| **Inspector** | Panel showing the selected node's properties and tags. |
| **Object Manager** | Panel showing the raw scene tree. |
| **Scope resolution** | Walking up the tree to find a variable definition. |
| **Group** | Organizational container node. Adds shared context to children. |
| **World** | Implicit container for all SimRoots. Not a SceneNode. |
| **Shared** | A node above all roots, accessible globally. |
