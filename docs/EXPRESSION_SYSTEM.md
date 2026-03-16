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
  phase: 'pre-rule' | 'post-rule'; // when in the tick pipeline
  enabled: boolean;
  source: 'code' | 'link' | 'script'; // how it was authored
  inputs: string[];                // declared input addresses
  outputs: string[];               // declared output addresses
  linkMeta?: LinkMeta;             // only when source === 'link'
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

## Sugar Commands

The `link.*` and `expr.*` commands are convenience wrappers that create ExpressionTags:

| Command | Creates | Phase | Source |
|---------|---------|-------|--------|
| `link.add cell.age cell.alpha` | Tag with rangeMap code | `pre-rule` | `link` |
| `expr.set alpha "age / 100"` | Tag with Python code | `post-rule` | `code` |
| `script.add monitor "..."` | Tag with script code | `post-rule` | `script` |

The `tag.*` commands operate on all tags directly:
- `tag.list` — list all tags
- `tag.show {id}` — full details
- `tag.setPhase {id} {phase}` — change evaluation phase
- `tag.copy {id} {owner}` — copy with self-ref update
- `tag.enable / tag.disable` — toggle

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

## Relationship to Node Editor (Phase 8)

The node editor is a visual view of ExpressionTag code:
- Open a tag → see its node graph
- Changes in code ↔ changes in node graph (bidirectional via NodeCompiler)
- Nodes compile to the same Python code that tags execute
- The tag is the primitive; the node graph is one of several authoring views

---

## Design Decisions

1. **Multiple tags per property**: Not enforced as one-per-property. Last-write-wins in pipeline order. Enables composable logic.

2. **Full write access**: Any tag can write to any address in the tree (like C4D). No restrictions.

3. **Cycle detection**: DFS-based cycle detection on the directed dependency graph at add-time.

4. **Copy semantics**: `self.*` references adapt to new owner. Absolute references stay fixed.
