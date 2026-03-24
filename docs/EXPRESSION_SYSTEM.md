# Unified Expression System

> Operator (formerly ExpressionTag) is the universal primitive for all computation logic in Lattice.

---

## Overview

Links, per-property expressions, global scripts, and (future) node graphs are all **Operators**. An operator lives on an object in the hierarchy, has a code body, declares its inputs/outputs, and evaluates at a specific point in the tick pipeline.

This design is inspired by Cinema 4D's XPresso tags and After Effects expressions:
- In C4D, an XPresso tag lives on an object, has a node graph (or Python code), uses `self` to reference its owner, and can read/write anything in the scene.
- Simple links, complex multi-property logic, and global controllers are all operators at different levels of the hierarchy.

---

## ExpressionTag Interface

> **Note:** The TypeScript interface is still named `ExpressionTag` in code, but is aliased as `Operator` in the UI and documentation.

```typescript
// UI name: "Operator" (aliased as Operator throughout the codebase)
interface ExpressionTag {
  id: string;                      // auto-generated
  name: string;                    // user-visible name
  owner: TagOwner;                 // what object this operator lives on
  code: string;                    // Python code (or auto-generated from link)
  phase: 'pre-rule' | 'rule' | 'post-rule'; // when in the tick pipeline
  enabled: boolean;
  source: 'code' | 'script';       // how it was authored ('link' deprecated → 'code' + linkMeta)
  inputs: string[];                // declared input addresses
  outputs: string[];               // declared output addresses
  linkMeta?: LinkMeta;             // present when created via link wizard (enables JS fast-path)
}
```

---

## Object Hierarchy

Operators live on objects in the simulation hierarchy:

```
Simulation (root)
├── Environment          (env.*)
├── Globals              (global.*)
├── CellType: BaseCell   (cell.*)
│   ├── [op: "fade-on-age"]     ← writes self.alpha
│   └── [op: "death-by-age"]    ← writes self.alive, reads global.ageLimit
├── CellType: SpecialCell
│   └── [copy of "fade-on-age"]  ← self = SpecialCell now
└── [op: "entropy-monitor"]     ← root op = global script
```

### Owner Types

| Type          | Description                     | `self` resolves to |
|---------------|---------------------------------|--------------------|
| `cell-type`   | Attached to a specific cell type | That cell type's properties |
| `environment` | Attached to env params           | `env.*` namespace |
| `global`      | Attached to global vars          | `global.*` namespace |
| `root`        | Top-level (global scope)         | All namespaces |

---

## Reference Modes

### `self` — Owner shorthand
- `self.age` → the owning cell type's `age` property
- When copying an operator between objects, `self.*` references automatically adapt

### Absolute — Full dot-path
- `cell.BaseCell.age`, `env.feedRate`, `global.myVar`
- These stay fixed when copying

### Future: Relative
- `parent.*`, `sibling.*` — will adapt when moving in hierarchy

---

## Pipeline Integration

Each operator declares `phase: 'pre-rule' | 'post-rule'`:

```
Per tick:
  0. Resolve pre-rule operators (JS fast-path for links)
  1. Execute rule (TS/WASM/Python)
  2. Swap buffers
  3. Evaluate post-rule operators (Python for code/script)
  4. Run global scripts
  5. Emit sim:tick
```

Operators within each phase run in dependency order (topological sort based on inputs/outputs).

---

## Fast-Path Optimization

Operators created via `link.add` with simple rangeMap patterns are detected as "simple range maps" and resolve in JavaScript (~0.01ms) without touching Pyodide:

```typescript
isSimpleRangeMap(tag): boolean {
  return tag.source === 'link' && tag.linkMeta !== undefined;
}
```

This preserves performance parity with the legacy LinkRegistry.

---

## Operator-Centric UI Architecture

Operators are the single CRUD surface for all computation. Users author through operators, not legacy interfaces.

### Authoring Surfaces

1. **UnifiedOpsSection** (in ScriptPanel) — full operator CRUD with source filtering, owner grouping, inline edit forms. Replaces the separate Expressions, Links, and Scripts sections.
2. **PropertyRow `+` button** (in CellPanel) — inline operator creation from any cell property. Pre-fills `source: 'code'` and `defaultTarget: 'cell.{propertyName}'`.

### Operator CRUD Commands

Primary interface:
- `op.add { source, ... }` — create operator (routes by source to create in both operator registry and legacy system)
- `op.remove { id }` — remove operator and clean up legacy system
- `op.edit { id, code?, phase?, ... }` — update operator and mirror to legacy

Sugar commands (create operators as side effect):
- `link.add` → creates link + operator
- `expr.set` → creates expression + operator
- `script.add` → creates script + operator

Lifecycle commands:
- `op.list`, `op.show`, `op.setPhase`, `op.copy`, `op.enable`, `op.disable`

### UI Component Hierarchy

```
ScriptPanel
├── PyodideStatus
├── VariablesSection (global variables, unchanged)
└── UnifiedOpsSection
    ├── Source filter toggles (ƒ / ⇄ / ⚡)
    ├── OpAddForm (polymorphic by source type)
    └── Owner groups
        └── OpRow (collapsed: badges + toggle + delete)
            └── Edit form (polymorphic: code / link / script)

CellPanel
└── CellCard
    └── PropertyRow
        ├── Expression indicator (ƒ badge when op exists)
        └── + button (hover, when no op) → inline OpAddForm
```

### Owner-Grouped View

Operators are grouped by owner in UnifiedOpsSection:
- **Root** — top-level operators (global scripts, root-level links)
- **Cell: {name}** — operators attached to a cell type
- **Environment** — operators on env params
- **Global** — operators on global variables

### Inline Editing

OpRow expands to show a polymorphic edit form:
- **code** → textarea for Python code, phase selector
- **link** → source/target (readonly), range inputs, easing dropdown
- **script** → name, code textarea, inputs/outputs fields, phase selector

### Legacy Compatibility

Legacy commands (`link.add`, `expr.set`, `script.add`) remain fully operational. They create operators as a side effect. The legacy stores (scriptStore, linkStore) continue to receive events for backward compatibility. `expressionStore` (UI: Operators) is the canonical UI data source for all computation.

---

## YAML Format

### New format (`expression_tags:`)

> **Note:** The YAML key remains `expression_tags:` for backward compatibility. The UI refers to these as "Operators".

```yaml
expression_tags:  # UI name: Operators
  - name: "fade-on-age"
    owner: { type: cell-type, id: base }
    code: "self.alpha = clamp(1.0 - self.age / 100, 0, 1)"
    phase: post-rule
    source: code
    inputs: ["cell.age"]
    outputs: ["cell.alpha"]

  - name: "age→alpha link"
    owner: { type: root }
    code: "# Auto-generated link"
    phase: pre-rule
    source: link
    inputs: ["cell.age"]
    outputs: ["cell.alpha"]
    linkMeta:
      sourceAddress: "cell.age"
      sourceRange: [0, 100]
      targetRange: [1.0, 0.0]
      easing: linear
```

### Legacy formats (backward compatible)

`parameter_links:` and `cell_properties[].expression` are still accepted on load and auto-converted to Operators (ExpressionTag instances).

---

## Relationship to Node Editor (Future)

The node editor is a visual view of Operator code:
- Open an operator → see its node graph
- Changes in code ↔ changes in node graph (bidirectional via NodeCompiler)
- Nodes compile to the same Python code that operators execute
- The operator is the primitive; the node graph is one of several authoring views

## Scene Graph Integration

> Full spec: `docs/SCENE_GRAPH.md`

The scene graph architecture evolves the expression system in three key ways:

1. **Operators live on SceneNodes** instead of flat `TagOwner` references. The `owner` field becomes a pointer into the scene tree (`parentId` on the operator's SceneNode). Variable resolution walks up ancestors. (Note: the `tags` field on SceneNode retains its name in code.)

2. **Links become a creation wizard**, not a source type. `ExpressionSource` simplifies to `'code' | 'script'`. The link wizard generates `rangeMap()` code and creates a normal code-source operator. `linkMeta` is preserved for fast-path JS resolution.

3. **Rule is an operator** with `phase: 'rule'`. `ExpressionPhase` extends to `'pre-rule' | 'rule' | 'post-rule'`. Built-in presets become pre-written rule operators. The rule is editable, swappable, and disable-able like any other operator.

---

## What's Next

The operator-centric UI phase unlocked:
- **Scene graph**: operators live on SceneNodes, scoped by tree position (see `docs/SCENE_GRAPH.md`)
- **Node editor**: can now target any operator via `op.edit` — just needs a visual node-graph authoring surface
- **Full legacy store removal**: once no UI reads from scriptStore.expressions/globalScripts or linkStore.links directly, those stores can be removed
- **Drag-to-reorder operators**: operators within an owner group could be reordered to control evaluation priority
- **Operator presets**: save/load named operator collections as reusable "behaviors"

---

## Design Decisions

1. **Multiple operators per property**: Not enforced as one-per-property. Last-write-wins in pipeline order. Enables composable logic.

2. **Full write access**: Any operator can write to any address in the tree (like C4D). No restrictions.

3. **Cycle detection**: DFS-based cycle detection on the directed dependency graph at add-time.

4. **Copy semantics**: `self.*` references adapt to new owner. Absolute references stay fixed.
