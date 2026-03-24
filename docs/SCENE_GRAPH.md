# Scene Graph Architecture

> The simulation IS a scoped object tree. This is the north-star spec for the C4D Object Manager model.

---

## Vision

Everything lives in a hierarchy. Operators (formerly ExpressionTags) attach computation to nodes. Panels are filtered views of the tree. Multiple roots enable independent simulations. The toolkit we use to make presets is the toolkit users get.

**Current state (SG-0 through SG-9 complete)**: SceneNode data model with SceneGraph class. SceneStore with selection. Object Manager + Inspector panels. Rule-as-operator (`phase: 'rule'`). Link-as-wizard (creates `source: 'code'` ops with `linkMeta`). Scope resolution walks up ancestors. Multi-sim via SimulationManager. YAML v2 schema with backward compat. Unified Card View replaces purpose-built panels. Numbered drawer layout: 1=ObjMgr+Inspector, 2=Card View (cells), 3=Card View (ops+globals), 4=Metrics.

**Remaining**: Tree is still a derived view (not source of truth yet). Copy semantics (`self.*` adaptation) not wired to UI. Full tree-as-source-of-truth migration (Phase 2 of migration strategy).

---

## The Node Primitive

A `SceneNode` is **one generic data structure**. The `type` field is metadata — a label that tells the UI what icon to show and tells the engine how to treat it. Structurally, every node is the same thing: a named entry in a tree with properties, children, and operators.

```typescript
interface SceneNode {
  id: string;
  type: string;                    // 'sim-root' | 'cell-type' | 'group' | 'environment' | 'globals' | etc.
  name: string;
  parentId: string | null;        // null = world-level
  childIds: string[];             // ordered
  enabled: boolean;
  properties: Record<string, any>; // generic property bag
  tags: string[];                  // IDs of Operators attached to this node  // UI: "Ops"
}
```

What makes a node an "Environment" vs a "CellType" is just its `type` label and what `properties` it carries. The engine interprets `type` to know what to do: `'cell-type'` nodes allocate grid buffers, `'environment'` nodes populate the params map, `'sim-root'` nodes own a Simulation instance. But the data model is one primitive.

This is exactly how C4D works — a Null, a Mesh, a Light are all `BaseObject`. They differ in type label and what data they carry, but structurally they're the same.

---

## The Tree

```
World (implicit root — not a scene node, just the container)
├── Shared                        (accessible from all sims)
│   └── [shared variables/ops]
├── SimRoot: "Simulation A"       (scope boundary)
│   ├── Environment               (env params: feedRate, killRate, ...)
│   ├── Globals                   (global vars: entropy, ageLimit, ...)
│   ├── CellType: "Base Cell"     (properties: alive, age, alpha, ...)
│   │   ├── [op: "fade-on-age"]   (expression: alpha = age / 100)
│   │   └── [op: "death-rule"]    (expression: alive = ...)
│   ├── CellType: "Red Cell"      (extends Base Cell)
│   │   └── [op: "extra-energy"]  (expression: energy -= 0.01)
│   ├── Group: "Visual FX"        (organizational container)
│   │   └── [op: "glow-effect"]   (shared by children)
│   ├── InitialState              (snapshot for reset)
│   └── [op: "conways-gol"]       (THE rule — phase: 'rule', on SimRoot)
└── SimRoot: "Simulation B"       (second independent sim)
    ├── Environment               (own params)
    ├── Globals                   (own variables)
    ├── CellType: "Fluid Cell"
    └── [op: "gray-scott"]        (different rule)
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
│       └── [op] reads "opacity" → finds 0.8 from Group "FX"
│       └── [op] reads "entropy" → finds 0.5 from Globals
│       └── [op] reads "feedRate" → finds value from Environment
└── Environment: { feedRate: 0.055 }
```

---

## Rule = Operator

The rule is not a special engine concept. It's just the Operator with `phase: 'rule'` on the SimRoot. It's editable, swappable, and disable-able like any other operator.

### How Rule Operators Work

- `phase: 'rule'` signals this operator IS the simulation rule
- Rule operators receive `RuleContext` (neighbors, cell, grid, coords) unlike pre/post operators which receive arrays
- Only one rule operator can be active per SimRoot at a time
- Disabling the rule operator = no-op tick (buffers still swap, but no computation)

### Rule Types

```typescript
{
  phase: 'rule',
  ruleType: 'typescript' | 'wasm' | 'python',
  // TS/WASM rules: code is the compute body, runs in JS
  // Python rules: code runs via Pyodide
}
```

### Built-in Presets as Rule Operators

Built-in presets (Conway's GoL, Gray-Scott, etc.) are pre-written rule operators. Their TS/WASM compute bodies become operator code. Loading a preset creates the rule operator on the SimRoot automatically.

### Rule Editing

```
op.edit { id: ruleOpId, code: 'new compute body' }
```

This calls `sim.updateRule(newBody)` under the hood. Same as current `rule.edit` but through the operator system.

### Rule Swapping

1. Disable current rule operator
2. Enable a different rule operator (or create a new one)
3. Only one `phase: 'rule'` operator should be enabled per SimRoot

---

## Link = Wizard

Links are a creation wizard, not an operator source type. Only two real operator types: expression (scoped to property) and script (general).

### The Wizard Concept

1. User opens the Link wizard (tab in OpAddForm)
2. Picks source address, target address, range mapping, easing
3. Wizard generates `rangeMap()` Python code
4. Creates a normal `source: 'code'` operator with that generated code
5. `linkMeta` preserved on the operator for fast-path JS resolution

### After Creation

The operator is just code. You can edit the code directly. The link wizard is one way to create an operator — after creation, it's indistinguishable from a hand-written expression (except for `linkMeta` enabling the fast path).

### Fast-Path Preservation

Operators with `linkMeta` (regardless of source) are detected by `isSimpleRangeMap()` and resolve in JS without Pyodide. This preserves the performance benefit of the legacy LinkRegistry.

### Migration

Existing `source: 'link'` operators are migrated to `source: 'code'` with `linkMeta` intact. The `'link'` source type is removed from the union.

---

## Panels as Views

Panels are filtered views of the scene tree, not independent data sources.

| Panel | What It Shows | Drawer | Default Filters |
|-------|---------------|--------|-----------------|
| **Object Manager** | Raw tree — all nodes, hierarchy, expand/collapse | 1 (top) | No filter |
| **Inspector** | Selected node's properties + attached operators | 1 (bottom) | `selectedNode` |
| **Card View** | Filtered cards — cells, env, globals, ops | 2 (cells), 3 (ops+globals) | `defaultFilters` prop |
| **Metrics** | Live sparkline graphs (cell count, tick rate) | 4 | N/A |

### Unified Card View

All "list" panels are the same `CardViewPanel` component with different `defaultFilters`. There are no separate CellPanel, ParamPanel, or ScriptPanel — just filtered Card Views.

- **Multi-select type filters**: Cells, Env, Vars, Ops — toggle multiple simultaneously
- **Collapsible sections**: When multiple types active, each gets a header with count and collapse toggle
- **Per-section + buttons**: Ops section opens OpAddForm, Vars opens VariableAddForm, Cells creates a new cell-type node
- **Rich operator cards**: Full OpRow with expand-to-edit, enable/disable toggle, phase badges, delete
- **Rich variable cards**: Inline value editing, type display, delete
- **Drawer 2** defaults to `['cells']` — shows cell type cards
- **Drawer 3** defaults to `['ops', 'globals']` — shows operator cards with OpRow editing + variable cards with inline editing

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
3 = Card View, defaultFilters=['ops', 'globals'] (right)
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

A preset describes the **complete scene graph** — every object, every property, every operator, every expression. Built-in presets and user presets are structurally identical.

A Conway's GoL preset has:
- One SimRoot
- One Environment (few params)
- One CellType (base cell with alive/age/alpha)
- One rule operator (B3/S23 in TypeScript)

A Navier-Stokes preset has:
- One SimRoot
- Rich Environment (viscosity, diffusion, dt, ...)
- Multiple CellTypes with vector properties (velocity vec2, pressure, divergence)
- Multiple expression operators for visualization
- A complex Python rule operator

The preset YAML fully describes the tree.

---

## Copy Semantics

### `self.*` Adapts

When copying an operator from one owner to another:
- `self.age` on CellType A → `self.age` on CellType B (adapts to new owner)
- `self` resolves to whichever node the operator is attached to

### Absolute References Stay Fixed

- `cell.BaseCell.age` stays as-is regardless of where the operator lives
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
        tags:                            # YAML key kept as 'tags:'; UI: "Ops"
          - name: "fade-on-age"
            code: "self.alpha = clamp(1.0 - self.age / 100, 0, 1)"
            phase: post-rule
      - type: initial-state
        data: { ... }
    tags:                                # YAML key kept as 'tags:'; UI: "Ops"
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

## Tick Pipeline (Operator Mapping)

```
Per tick:
  0. Resolve pre-rule ops    (phase='pre-rule', JS fast-path for linkMeta ops)
  1. Execute rule operator    (phase='rule', TS/WASM/Python — THE rule)
  2. Swap buffers             (rule output becomes current)
  3. Evaluate post-rule ops   (phase='post-rule', Python for code/script)
  4. Run global scripts       (source='script', per-frame Python)
  5. Emit sim:tick
```

Operators within each phase run in dependency order (topological sort on inputs/outputs).

Pre-rule link operators use JS `rangeMap` for speed. The rule operator receives `RuleContext`. Post-rule code operators go through the Pyodide Python harness.

---

## Migration Strategy

### Phase 1: Tree as Derived View

Tree is built from existing flat state via `SceneGraph.fromSimulation(sim)`. The tree is **read-only** — mutations still go through existing commands (`param.set`, `op.add`, etc.). The tree updates reactively when the underlying state changes.

### Phase 2: Tree as Source of Truth

Tree becomes the canonical data model. Commands mutate the tree directly. The flat stores (simStore, expressionStore, etc.) become derived from the tree. Engine reads from tree nodes instead of flat registries.

### Dual-Write Avoidance

During transition, avoid dual-writing to both tree and flat stores. Instead:
1. Commands write to the authoritative source (flat stores in phase 1, tree in phase 2)
2. The other view is derived/rebuilt automatically
3. No manual sync code that can drift

### Legacy Compatibility

- `TagOwner` types map directly to node types: `'cell-type'` → CellType node, `'environment'` → Environment node, etc.
- Existing `ExpressionTag.owner` is a pointer into the tree (same as `parentId` on the operator)
- `linkStore` and `scriptStore` are deprecated once the tree is source of truth

---

## Glossary

| Term | Definition |
|------|-----------|
| **SceneNode** | The one generic data structure for all objects in the tree. |
| **SimRoot** | A SceneNode with `type: 'sim-root'`. Scope boundary. Owns a Simulation instance. |
| **Scope boundary** | A SimRoot prevents variable resolution from crossing into another simulation. |
| **Operator (Op)** | A computation unit attached to a SceneNode. All computation is an operator. |
| **Tag** | (legacy term, now Operator/Op) See Operator. |
| **Expression** | An operator with `source: 'code'`, scoped to a property. |
| **Script** | An operator with `source: 'script'`, general-purpose Python. |
| **Rule operator** | An operator with `phase: 'rule'`. THE simulation rule. One per SimRoot. |
| **Wizard** | A creation UI that generates operator code. Links are a wizard, not a source type. |
| **Inspector** | Panel showing the selected node's properties and attached operators. |
| **Object Manager** | Panel showing the raw scene tree. |
| **Scope resolution** | Walking up the tree to find a variable definition. |
| **Group** | Organizational container node. Adds shared context to children. |
| **World** | Implicit container for all SimRoots. Not a SceneNode. |
| **Shared** | A node above all roots, accessible globally. |
