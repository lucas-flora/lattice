# Unified Expression System

> ExpressionTag is the universal primitive for all computation logic in Lattice.

---

## Overview

Links, per-property expressions, global scripts, and (future) node graphs are all **ExpressionTags**. A tag lives on an object in the hierarchy, has a code body, declares its inputs/outputs, and evaluates at a specific point in the tick pipeline.

This design is inspired by Cinema 4D's XPresso tags and After Effects expressions:
- In C4D, an XPresso tag lives on an object, has a node graph (or Python code), uses `self` to reference its owner, and can read/write anything in the scene.
- Simple links, complex multi-property logic, and global controllers are all tags at different levels of the hierarchy.

---

## ExpressionTag Interface

```typescript
interface ExpressionTag {
  id: string;                      // auto-generated
  name: string;                    // user-visible name
  owner: TagOwner;                 // what object this tag lives on
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

Tags live on objects in the simulation hierarchy:

```
Simulation (root)
├── Environment          (env.*)
├── Globals              (global.*)
├── CellType: BaseCell   (cell.*)
│   ├── [tag: "fade-on-age"]     ← writes self.alpha
│   └── [tag: "death-by-age"]    ← writes self.alive, reads global.ageLimit
├── CellType: SpecialCell
│   └── [copy of "fade-on-age"]  ← self = SpecialCell now
└── [tag: "entropy-monitor"]     ← root tag = global script
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
- When copying a tag between objects, `self.*` references automatically adapt

### Absolute — Full dot-path
- `cell.BaseCell.age`, `env.feedRate`, `global.myVar`
- These stay fixed when copying

### Future: Relative
- `parent.*`, `sibling.*` — will adapt when moving in hierarchy

---

## Pipeline Integration

Each tag declares `phase: 'pre-rule' | 'post-rule'`:

```
Per tick:
  0. Resolve pre-rule tags (JS fast-path for links)
  1. Execute rule (TS/WASM/Python)
  2. Swap buffers
  3. Evaluate post-rule tags (Python for code/script)
  4. Run global scripts
  5. Emit sim:tick
```

Tags within each phase run in dependency order (topological sort based on inputs/outputs).

---

## Fast-Path Optimization

Tags created via `link.add` with simple rangeMap patterns are detected as "simple range maps" and resolve in JavaScript (~0.01ms) without touching Pyodide:

```typescript
isSimpleRangeMap(tag): boolean {
  return tag.source === 'link' && tag.linkMeta !== undefined;
}
```

This preserves performance parity with the legacy LinkRegistry.

---

## Tag-Centric UI Architecture

Tags are the single CRUD surface for all computation. Users author through tags, not legacy interfaces.

### Authoring Surfaces

1. **UnifiedTagsSection** (in ScriptPanel) — full tag CRUD with source filtering, owner grouping, inline edit forms. Replaces the separate Expressions, Links, and Scripts sections.
2. **PropertyRow `+` button** (in CellPanel) — inline tag creation from any cell property. Pre-fills `source: 'code'` and `defaultTarget: 'cell.{propertyName}'`.

### Tag CRUD Commands

Primary interface:
- `tag.add { source, ... }` — create tag (routes by source to create in both tag registry and legacy system)
- `tag.remove { id }` — remove tag and clean up legacy system
- `tag.edit { id, code?, phase?, ... }` — update tag and mirror to legacy

Sugar commands (create tags as side effect):
- `link.add` → creates link + tag
- `expr.set` → creates expression + tag
- `script.add` → creates script + tag

Lifecycle commands:
- `tag.list`, `tag.show`, `tag.setPhase`, `tag.copy`, `tag.enable`, `tag.disable`

### UI Component Hierarchy

```
ScriptPanel
├── PyodideStatus
├── VariablesSection (global variables, unchanged)
└── UnifiedTagsSection
    ├── Source filter toggles (ƒ / ⇄ / ⚡)
    ├── TagAddForm (polymorphic by source type)
    └── Owner groups
        └── TagRow (collapsed: badges + toggle + delete)
            └── Edit form (polymorphic: code / link / script)

CellPanel
└── CellCard
    └── PropertyRow
        ├── Expression indicator (ƒ badge when tag exists)
        └── + button (hover, when no tag) → inline TagAddForm
```

### Owner-Grouped View

Tags are grouped by owner in UnifiedTagsSection:
- **Root** — top-level tags (global scripts, root-level links)
- **Cell: {name}** — tags attached to a cell type
- **Environment** — tags on env params
- **Global** — tags on global variables

### Inline Editing

TagRow expands to show a polymorphic edit form:
- **code** → textarea for Python code, phase selector
- **link** → source/target (readonly), range inputs, easing dropdown
- **script** → name, code textarea, inputs/outputs fields, phase selector

### Legacy Compatibility

Legacy commands (`link.add`, `expr.set`, `script.add`) remain fully operational. They create tags as a side effect. The legacy stores (scriptStore, linkStore) continue to receive events for backward compatibility. `expressionStore` is the canonical UI data source for all computation.

---

## YAML Format

### New format (`expression_tags:`)

```yaml
expression_tags:
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

`parameter_links:` and `cell_properties[].expression` are still accepted on load and auto-converted to ExpressionTags.

---

## Relationship to Node Editor (Future)

The node editor is a visual view of ExpressionTag code:
- Open a tag → see its node graph
- Changes in code ↔ changes in node graph (bidirectional via NodeCompiler)
- Nodes compile to the same Python code that tags execute
- The tag is the primitive; the node graph is one of several authoring views

## Scene Graph Integration

> Full spec: `docs/SCENE_GRAPH.md`

The scene graph architecture evolves the expression system in three key ways:

1. **Tags live on SceneNodes** instead of flat `TagOwner` references. The `owner` field becomes a pointer into the scene tree (`parentId` on the tag's SceneNode). Variable resolution walks up ancestors.

2. **Links become a creation wizard**, not a source type. `ExpressionSource` simplifies to `'code' | 'script'`. The link wizard generates `rangeMap()` code and creates a normal code-source tag. `linkMeta` is preserved for fast-path JS resolution.

3. **Rule is a tag** with `phase: 'rule'`. `ExpressionPhase` extends to `'pre-rule' | 'rule' | 'post-rule'`. Built-in presets become pre-written rule tags. The rule is editable, swappable, and disable-able like any other tag.

---

## What's Next

The tag-centric UI phase unlocked:
- **Scene graph**: tags live on SceneNodes, scoped by tree position (see `docs/SCENE_GRAPH.md`)
- **Node editor**: can now target any tag via `tag.edit` — just needs a visual node-graph authoring surface
- **Full legacy store removal**: once no UI reads from scriptStore.expressions/globalScripts or linkStore.links directly, those stores can be removed
- **Drag-to-reorder tags**: tags within an owner group could be reordered to control evaluation priority
- **Tag presets**: save/load named tag collections as reusable "behaviors"

---

## Design Decisions

1. **Multiple tags per property**: Not enforced as one-per-property. Last-write-wins in pipeline order. Enables composable logic.

2. **Full write access**: Any tag can write to any address in the tree (like C4D). No restrictions.

3. **Cycle detection**: DFS-based cycle detection on the directed dependency graph at add-time.

4. **Copy semantics**: `self.*` references adapt to new owner. Absolute references stay fixed.
