# Feature Research

**Domain:** Universal simulation substrate / cellular automata web platform
**Researched:** 2026-03-10
**Confidence:** HIGH (cross-verified across Golly, LifeViewer, VisualPDE, Sandspiel, The Powder Toy, reaction-diffusion playgrounds, NetLogo, WebGL fluid sims)

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline behaviors that every simulation tool has. Absence signals an unfinished product.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Play / pause / step controls | Every simulator has these; the first thing users reach for | LOW | Step-forward is essential; step-back is a differentiator |
| Speed control (FPS slider) | Users need to slow down to observe, speed up to explore | LOW | Integer FPS + "as fast as possible" modes both needed |
| Grid rendering with pan and zoom | Without navigation the grid is a static image | MEDIUM | Smooth non-integer zoom expected (LifeViewer sets the bar) |
| Cell drawing / erasing with mouse | Direct manipulation is the primary discovery path | LOW | Brush size matters for large grids |
| Pattern reset / clear | Users iterate on initial states constantly | LOW | "Clear" and "reset to initial state" are separate operations |
| Undo / redo | Accidental edits kill exploration; Golly has unlimited undo | MEDIUM | Must work across all input surfaces by project spec |
| Built-in example patterns / presets | New users need something to run immediately | LOW | No preset = cold-start problem |
| Simulation state display (generation counter, cell count) | Basic feedback loop; all platforms show it | LOW | Generation number is minimum; cell count useful |
| Zoom to fit / center view | Patterns frequently drift off-screen | LOW | Auto-fit on load is expected |
| Configurable grid topology | Toroidal (wrap-around) vs. finite edges is a core choice | LOW-MEDIUM | Golly supports torus, Klein bottle, plane; at minimum toroidal vs. finite |
| Rule selection or switching | Platform identity: users expect to change the rule being applied | MEDIUM | The mechanism varies, but the capability is universal |
| Export / save output | Users want to share or document results | MEDIUM | Screenshot minimum; GIF and data export are common expectations in web tools |

---

### Differentiators (Competitive Advantage)

These separate Lattice from every existing simulator. Aligned with Lattice's core value proposition.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| YAML preset format as universal API | Any simulation = one file; shareable, human-readable, version-controllable | HIGH | No existing web CA tool uses declarative rule files; Golly uses rule tables in proprietary formats; this is a genuine gap. Schema must be stable early |
| Cell Property System with composable inputs/outputs | Rules can read/write named typed properties, not just integer state; enables fluid, reaction-diffusion, agent logic in the same engine | HIGH | Enables the "universal substrate" claim; no current tool does this without separate codebases |
| Three Surface Doctrine: GUI + CLI + AI equally powerful | Every action is scriptable and AI-commandable; bridges the power-user gap cleanly | HIGH | LLM-integrated simulation tools exist in research (MCP-SIM, Ansys Copilot) but none in consumer CA platforms |
| Data-driven visual layer: any property → any visual parameter | Color, size, shape, orientation are not hardcoded; users define the visual mapping in YAML | HIGH | VisualPDE allows expression-based coloring; Lattice extends this to size/shape/orientation — rare in any tool |
| Reverse playback (step backward) | Users can rewind to investigate what caused a pattern | MEDIUM | LifeViewer has this for reversible Margolus patterns only; Lattice can generalize it via state history buffer |
| Timeline scrubbing | Navigate simulation history like a video; not just step-by-step | MEDIUM | No current CA web tool has a proper scrubbing timeline |
| Multi-viewport with independent camera/rule settings | Compare two parameter sets side-by-side; compare 1D/2D/3D views simultaneously | HIGH | EnSight and OVITO offer multi-viewport in scientific tools; no CA web tool does |
| 1D / 2D / 3D in a single unified renderer | Wolfram 1D rules, GoL 2D, and 3D automata in the same canvas system | HIGH | Most tools are locked to one dimensionality; Three.js makes 3D first-class without extra cost |
| AI assistant with full app-state context and command execution | Natural language drives simulation; AI can read grid state, suggest parameters, execute CLI commands | HIGH | Consumer-facing novelty; aligned with emerging research direction (MCP-SIM, FlamePilot pattern) |
| Ghost-text CLI autocomplete with deterministic command tree | Power-user surface with discoverability baked in | MEDIUM | Inspired by shell UX patterns but uncommon in simulation tools |
| WASM (Rust) rule execution pipeline | Rule-heavy sims (Navier-Stokes, Gray-Scott) run near-native speed in browser | HIGH | Sandspiel uses WASM+WebGL; Lattice applies same pattern universally across rule types |
| Community preset gallery with upload/download | Living ecosystem of user-defined simulations | MEDIUM | Powder Toy's community server is a strong precedent; Sandspiel has a gallery; neither is YAML-file based |
| Shareable URL state encoding | Instant link-to-simulation without accounts | LOW-MEDIUM | VisualPDE does this elegantly for PDEs; Lattice should adopt the same pattern for presets |
| ASCII art export per frame | Nostalgic, unique, works in terminals | LOW | No current browser CA tool offers this; strong alignment with CLI/terminal identity |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time multiplayer / collaborative editing | "Google Docs for simulations" sounds appealing | Simulation state is deterministic-sequential; merging concurrent edits on a grid is a CRDT problem of extraordinary complexity; conflicts in rule execution are undefined; Out of Scope in PROJECT.md | Single-user tool with shareable-URL snapshots covers 90% of the sharing use case |
| Server-side simulation execution | "Run big sims in the cloud" solves browser performance ceiling | Destroys the offline-first, privacy-preserving property; adds latency on every tick; requires infrastructure; Out of Scope in PROJECT.md | WASM+WebGL handles grids up to ~4M cells in browser; typed arrays + Rust WASM is the performance path |
| Native mobile app | Mobile users want the same experience | Touch grid editing on a 6" screen is genuinely unusable for fine-grained CA work; duplicating the codebase for iOS/Android is massive overhead | Responsive web design with touch-friendly controls; PWA install covers offline use |
| Custom 2D renderer alongside Three.js | "Three.js is overkill for 2D GoL" | Maintaining two render paths doubles the surface area; bugs appear in one but not the other; Key Decision in PROJECT.md | Three.js orthographic camera in 2D mode is indistinguishable from a 2D canvas renderer at interactive FPS |
| Scripting language embedded in presets (Lua/Python) | Power users want rule logic in code, not YAML | Arbitrary script execution in browser is sandboxed-but-complex; YAML + WASM Rust covers 99% of custom rule needs; scripting introduces a learning cliff opposite to Lattice's accessibility goal | YAML Cell Property System with computed functions (inline expressions); WASM for performance-critical custom rules |
| Rule editor with visual flow graph (node-based) | "No-code" rule authoring looks like a great UX | Node graphs become unreadable for complex rules quickly; build cost is 2–3x a text editor; YAML is already readable for structured data | YAML with schema validation and live preview achieves 80% of the goal at 20% of the cost |
| Social features (follows, likes, comments on presets) | Makes the community platform stickier | Social graph infrastructure is a separate product; moderation is a full-time job; these features ship last in successful creative tools (Powder Toy took years) | Launch with community gallery (upload/browse/download); defer social graph |
| Historical/infinite undo (unlimited past states) | Users want to rewind arbitrarily far | State buffer for every generation is O(generations × grid_size) memory; a 1000×1000 grid at 1000 generations = 1GB of raw state | Configurable history depth (last N generations); keyframe checkpointing for longer runs |

---

## Feature Dependencies

```
Universal Grid Engine (1D/2D/3D)
    └──required by──> Cell Property System
                          └──required by──> YAML Preset Loader
                                               └──required by──> Built-in Presets (GoL, Rule 110, etc.)
                                               └──required by──> Community Gallery
                          └──required by──> WASM Rule Execution Pipeline
                          └──required by──> Data-Driven Visual Layer

Three.js Renderer
    └──required by──> Multi-Viewport System
    └──required by──> 3D grid support
    └──required by──> Data-Driven Visual Layer (color/size/shape/orientation)

Play/Pause/Step Controls + State History Buffer
    └──required by──> Reverse Playback
    └──required by──> Timeline Scrubbing
    └──required by──> Undo/Redo (simulation steps vs. edit undo are separate concerns)

CLI Terminal (shared component)
    └──required by──> AI Assistant (chat surface shares terminal component)
    └──required by──> Ghost-text Autocomplete
    └──enhances──>    Three Surface Doctrine (CLI = one of three surfaces)

YAML Preset Format (stable schema)
    └──required by──> Community Gallery (file format is the exchange unit)
    └──required by──> Shareable URL encoding (serialize preset to URL params)
    └──required by──> AI Assistant (AI reads/writes YAML to configure sims)

Export System (GIF / CSV / ASCII)
    └──required by──> GIF export (requires state history or frame buffer)
    └──independent of──> Community Gallery (export ≠ share)

Supabase + pgvector
    └──required by──> AI Assistant RAG (docs, preset corpus)
    └──independent of──> Core simulation engine
```

### Dependency Notes

- **YAML Preset Loader requires stable Cell Property System schema:** The loader parses `cell_properties` blocks into the engine's typed property system. If the Cell Property System API is not stable, the YAML schema cannot be finalized — this is the highest-priority sequencing constraint in the entire project.
- **Community Gallery requires YAML Preset Format stability:** If the schema changes after community presets are uploaded, all shared files break. Schema must be versioned from day one.
- **Multi-Viewport requires Three.js renderer to be modular:** Each viewport needs an independent Three.js scene or camera. The renderer cannot be a singleton tied to a single DOM element.
- **Reverse Playback and Timeline Scrubbing require State History Buffer:** The buffer design (circular buffer, keyframe delta compression) must be decided before building either playback feature. Memory budget for grid size × history depth is a real constraint.
- **Three Surface Doctrine requires CLI Terminal before AI Assistant:** The terminal is the shared UI component for both CLI commands and AI chat. AI assistant is layered on top of terminal infrastructure.
- **WASM rule execution is a performance optimization, not a correctness requirement:** The engine must work in pure TypeScript first; WASM drops in as an accelerated execution backend. This allows phased delivery.

---

## MVP Definition

### Launch With (v1)

Minimum to validate Lattice's core concept: "any simulation = a YAML file."

- [ ] Universal Grid Engine (2D first, 1D/3D defer) — without the grid nothing runs
- [ ] Cell Property System (core typed-property engine) — load-bearing for everything else
- [ ] YAML Preset Loader with schema validation — the unique value prop is a YAML file; must exist at launch
- [ ] Built-in presets: Conway's GoL, Rule 110, Gray-Scott, Langton's Ant — proves the universality claim
- [ ] Three.js renderer (2D orthographic mode) — unified renderer from day one even in 2D-only phase
- [ ] Play / pause / step / speed controls — minimum interaction model
- [ ] Cell drawing and erasing — users must be able to create initial states
- [ ] Undo / redo — accidental edits must be recoverable
- [ ] Data-driven visual layer (color mapping from cell properties) — makes the visual identity distinct
- [ ] Export: GIF + screenshot — users must be able to share output
- [ ] CLI Terminal (basic command tree, no AI yet) — establishes the Three Surface foundation
- [ ] HUD with hotkeys — keyboard-driven workflow is table stakes for power users

### Add After Validation (v1.x)

- [ ] Reverse playback and timeline scrubbing — add when users ask "how did this happen?"
- [ ] AI assistant integration — add after CLI terminal is stable and tested
- [ ] Community preset gallery — add when there are enough built-in presets to seed the gallery
- [ ] Multi-viewport system — add when users request side-by-side comparison
- [ ] 3D grid support — add after 2D is validated and Three.js renderer is confirmed stable
- [ ] WASM rule execution — add when performance ceiling of TypeScript engine is hit in user testing
- [ ] Navier-Stokes fluid sim preset — highest compute cost; add after WASM pipeline exists
- [ ] Shareable URL state encoding — add before community gallery launch (needed for linking)
- [ ] ASCII art export — add alongside CLI terminal identity features (low cost, high personality)

### Future Consideration (v2+)

- [ ] 1D Wolfram automata with spacetime diagram view — niche but natural extension; defer until 2D/3D stable
- [ ] Agent-based model presets (Langton's Ant is v1; full agent system is v2) — requires extending Cell Property System with movement/spawning semantics
- [ ] Neural cellular automata — research-grade feature; add if academic user segment emerges
- [ ] PWA / offline install — add when core is stable and there is demand for offline use

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Universal Grid Engine (2D) | HIGH | MEDIUM | P1 |
| Cell Property System | HIGH | HIGH | P1 |
| YAML Preset Loader + schema | HIGH | HIGH | P1 |
| Built-in presets (GoL, Rule 110, Gray-Scott, Langton's Ant) | HIGH | MEDIUM | P1 |
| Three.js renderer (2D) | HIGH | MEDIUM | P1 |
| Play/pause/step/speed controls | HIGH | LOW | P1 |
| Cell drawing/erasing | HIGH | LOW | P1 |
| Undo/redo | HIGH | MEDIUM | P1 |
| Data-driven visual layer (color) | HIGH | MEDIUM | P1 |
| GIF export | MEDIUM | MEDIUM | P1 |
| CLI terminal (basic) | MEDIUM | HIGH | P1 |
| HUD + hotkeys | MEDIUM | LOW | P1 |
| Reverse playback / timeline scrubbing | HIGH | MEDIUM | P2 |
| AI assistant (with Supabase RAG) | HIGH | HIGH | P2 |
| Community preset gallery | HIGH | MEDIUM | P2 |
| Multi-viewport | MEDIUM | HIGH | P2 |
| 3D grid + renderer | MEDIUM | HIGH | P2 |
| WASM rule execution | HIGH (at scale) | HIGH | P2 |
| Navier-Stokes preset | MEDIUM | HIGH | P2 |
| Shareable URL encoding | MEDIUM | LOW | P2 |
| ASCII art export | LOW | LOW | P2 |
| 1D Wolfram automata + spacetime view | LOW | MEDIUM | P3 |
| Agent-based model system | MEDIUM | HIGH | P3 |
| Neural cellular automata | LOW | HIGH | P3 |
| PWA / offline install | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (validates core concept)
- P2: Should have, adds after initial validation
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Golly (desktop) | LifeViewer (web) | VisualPDE (web) | Sandspiel (web) | Powder Toy (desktop/web) | Lattice |
|---------|-----------------|------------------|-----------------|-----------------|--------------------------|---------|
| Rule format | Proprietary RuleTable/RuleTree | Pattern strings | LaTeX-like PDE expressions | Hardcoded elements in Rust | Lua scripting | YAML files (human-readable, portable) |
| Rule switching | Plugin-loaded at runtime | Pattern-embedded | Equation fields | Fixed element set | Fixed + Lua mods | YAML preset swap; live reload |
| Dimensions | 2D only (some 3D CAs) | 2D | 1D, 2D | 2D | 2D | 1D, 2D, 3D unified |
| Visual mapping | Fixed color tables | Fixed per-rule | Expression-based color | Fixed per-element | Fixed + Lua | Any property → any visual param |
| Reverse playback | No | Partial (Margolus only) | No | No | No | Yes (state history buffer) |
| Timeline scrubbing | No | No | Checkpoints only | No | No | Yes |
| CLI interface | No | No | No | No | No | Yes (Three Surface Doctrine) |
| AI assistant | No | No | No | No | No | Yes (GPT-4o + RAG) |
| Community sharing | Pattern downloads | Wiki-embedded | Shareable URL | Gallery upload | Save server (upvote/downvote) | Gallery with YAML file download + URL |
| Performance | HashLife algorithm | Canvas-based JS | WebGL GLSL shaders | WASM + WebGL | C++ native | WASM (Rust) + Three.js |
| Export | RLE/macrocell/image | PNG/GIF | Screenshot, URL | Canvas snapshot | Save file | GIF, CSV, ASCII art, screenshot |
| Scripting | Lua, Python | No | No | No | Lua | No scripting (YAML + WASM covers it) |
| Multi-viewport | Layers system | No | No | No | No | Yes |
| Web-native | No (desktop app) | Yes | Yes | Yes | Partial | Yes |

---

## Sources

- [Golly Home Page](https://golly.sourceforge.io/) — feature enumeration (HIGH confidence, official)
- [LifeViewer - LifeWiki](https://conwaylife.com/wiki/LifeViewer) — viewport, playback, undo features (HIGH confidence, official wiki)
- [VisualPDE Advanced Options](https://visualpde.com/user-guide/advanced-options.html) — parameter, visualization, URL sharing (HIGH confidence, official docs)
- [The Powder Toy](https://powdertoy.co.uk/) — community server, Lua scripting, element count (MEDIUM confidence, official site + Wikipedia)
- [Sandspiel by maxbittker](https://maxbittker.itch.io/sandspiel) — WASM+WebGL, community gallery, element interactions (MEDIUM confidence, itch.io + GitHub)
- [Reaction-Diffusion Playground by jasonwebb](https://jasonwebb.github.io/reaction-diffusion-playground/) — parameter controls, style maps (MEDIUM confidence, WebSearch + GitHub)
- [WebGL Fluid Simulation by Pavel Dobryakov](https://paveldogreat.github.io/WebGL-Fluid-Simulation/) — physics parameter controls, GPU rendering (MEDIUM confidence, WebSearch)
- [NetLogo Home](https://www.netlogo.org/) — agent-based modeling features, BehaviorSpace (HIGH confidence, official)
- [Automata Ecosystem on Steam](https://store.steampowered.com/app/1966940/) — GPU-accelerated multi-species CA with procedural audio (MEDIUM confidence, Steam listing)
- [Cellular Automata in WebGL — Medium](https://medium.com/@bpmw/cellular-automata-in-webgl-part-1-df531059f0ab) — GPU ping-pong technique, performance patterns (MEDIUM confidence, single source)
- [VisualPDE paper — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10570185/) — architectural approach to browser PDE solving (HIGH confidence, peer-reviewed)

---
*Feature research for: Universal simulation substrate / cellular automata web platform (Lattice)*
*Researched: 2026-03-10*
