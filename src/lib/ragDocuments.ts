/**
 * RAG documentation content for Lattice app features.
 *
 * GUIP-06: Full app documentation intended for embedding in Supabase pgvector.
 * These documents complement the CA reference docs seeded in Phase 8.
 * They cover app features, UI controls, architecture, and workflows.
 */

export interface RagDocumentDef {
  title: string;
  content: string;
  category: string;
  source: string;
}

/**
 * Full set of Lattice app documentation for RAG embedding.
 * Covers all major features from Phases 1-10.
 */
export const LATTICE_APP_DOCS: RagDocumentDef[] = [
  {
    title: 'Lattice App Overview',
    content: `Lattice is a universal cellular automaton simulator built with Next.js, Three.js, and Rust/WASM. It supports 1D, 2D, and 3D grid simulations with six built-in presets: Conway's Game of Life, Rule 110, Langton's Ant, Brian's Brain, Gray-Scott reaction-diffusion, and Navier-Stokes fluid dynamics. The app follows the Three Surface Doctrine: every action is accessible via GUI buttons, CLI terminal commands, and the AI assistant — all routing through a single CommandRegistry.`,
    category: 'overview',
    source: 'lattice-app-docs',
  },
  {
    title: 'Grid Engine Architecture',
    content: `The grid engine uses typed arrays (Float32Array) with ping-pong double buffering for correct rule evaluation. Grids support 1D, 2D, and 3D dimensionalities with configurable topology (toroidal wrap-around or finite edges). The Cell Property System allows cells to have static parameters (bool, int, float) and computed functions. Properties declare input/output roles for composable behavior. All engine code is pure TypeScript with zero UI imports, running in a dedicated Web Worker.`,
    category: 'architecture',
    source: 'lattice-app-docs',
  },
  {
    title: 'YAML Preset System',
    content: `Presets are defined in versioned YAML files validated with Zod. Schema sections include: meta (name, author, tags), grid (dimensions, resolution, boundary), cell_properties (types, defaults, I/O roles), rule (compute function — TypeScript or WASM), visual_mappings (property-to-visual channel), and ai_context (optional AI hints). User-uploaded YAML files are treated identically to built-in presets — no privilege difference. Load presets via GUI dropdown or CLI: preset load <name>.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Simulation Controls',
    content: `Controls: Play/Pause (Space), Step Forward (N), Step Back (B), Reset (R), Clear (C). Speed slider adjusts FPS (1-60 or Max). Timeline scrubber allows dragging to any visited generation. Cell drawing with configurable brush size (1-7). Undo/Redo via Ctrl+Z/Ctrl+Shift+Z using sparse Command-pattern diffs. All controls work identically via GUI buttons and CLI commands through the CommandRegistry.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Rendering System',
    content: `The renderer uses Three.js with a unified InstancedMesh path for all grid dimensions. 2D grids use PlaneGeometry quads, 1D grids render as spacetime diagrams (vertical strip view), and 3D grids use BoxGeometry voxels with MeshLambertMaterial and lighting. Visual mappings are data-driven from YAML: any cell property can drive color, size, shape, or orientation. Zero-copy rendering reads typed arrays directly from the engine. GPU resources are explicitly disposed on unmount.`,
    category: 'architecture',
    source: 'lattice-app-docs',
  },
  {
    title: 'Multi-Viewport and Camera Controls',
    content: `The app supports split viewport (two views side-by-side) with independent cameras. Each viewport can be toggled to fullscreen (F key). 2D viewports use orthographic camera with smooth pan and zoom (including non-integer zoom levels). 3D viewports use perspective camera with orbit controls (rotate, zoom, pan). Zoom-to-fit frames the entire grid. Camera state persists across view changes.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'WASM Acceleration',
    content: `Performance-critical rules (Gray-Scott, Navier-Stokes) have Rust implementations compiled to WASM via wasm-bindgen-cli. The WASM API operates on whole ticks (not per-cell) to minimize JS/WASM boundary overhead. SharedArrayBuffer enables zero-copy data transfer between the Web Worker and WASM module. If the WASM module is unavailable, RuleRunner silently falls back to TypeScript — no error thrown. COOP/COEP headers are configured for SharedArrayBuffer support.`,
    category: 'architecture',
    source: 'lattice-app-docs',
  },
  {
    title: 'AI Assistant',
    content: `The AI assistant uses OpenAI GPT-4o with streaming responses in the terminal. It has full app state context (preset, generation, parameters, recent actions) but never receives raw grid buffers. It can execute CLI commands on the user's behalf (e.g., "load the Gray-Scott preset") and detects misspelled commands using Levenshtein distance. RAG retrieval from Supabase pgvector provides CA reference material with citations. The AI only responds to direct terminal input — never interrupts.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Terminal and CLI',
    content: `The terminal toggles with T key. It accepts CLI commands with ghost-text autocomplete that only suggests valid commands. Command format: <category> <action> [params]. Examples: sim play, sim step, preset load gray-scott, view zoom 2.5, edit draw 10 15. Non-command input is routed to the AI assistant. Terminal displays timestamped app logs. Command history navigable with up/down arrows.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Keyboard Shortcuts Reference',
    content: `All keyboard shortcuts in Lattice: Space = Play/Pause, N = Step Forward, B = Step Back, R = Reset, C = Clear Grid, T = Toggle Terminal, P = Toggle Parameters Panel, F = Toggle Fullscreen, S = Toggle Split View, ? = Show Keyboard Shortcuts, Ctrl+Z = Undo, Ctrl+Shift+Z = Redo. Shortcuts are disabled when typing in the terminal input. Press ? to see the full shortcut overlay.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Parameter Visualization',
    content: `The Parameters panel (toggle with P key) shows preset info, grid dimensions, simulation status, and live sparkline graphs. Graphs display Cell Count (live cells over time) and Tick Rate (ticks per second) as green sparklines on a dark background. Data is stored in a ring buffer of 200 samples. Graphs update automatically as the simulation runs and reset when loading a new preset.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Screenshot Export',
    content: `Export a screenshot of the current viewport as a PNG file. Use the camera button in the control bar or the CLI command: viewport screenshot. Screenshots are saved with a timestamped filename (lattice-YYYY-MM-DD-HHMMSS.png). The screenshot captures the Three.js canvas content at its current resolution.`,
    category: 'features',
    source: 'lattice-app-docs',
  },
  {
    title: 'Performance Characteristics',
    content: `Gray-Scott 512x512 with WASM: target frame time under 16ms for 60fps. Key optimizations: InstancedMesh for GPU-instanced rendering (no per-frame object allocation), zero-copy typed array reads, whole-tick WASM API (single extern call per tick), SharedArrayBuffer for zero-copy JS/WASM bridge, reusable Matrix4/Color/Vector3 temporaries. Performance bottleneck areas: Laplacian computation in reaction-diffusion, instance matrix updates for large grids, garbage collection from snapshot history.`,
    category: 'performance',
    source: 'lattice-app-docs',
  },
];

/**
 * Get the total number of app documentation documents.
 */
export function getAppDocCount(): number {
  return LATTICE_APP_DOCS.length;
}

/**
 * Get all document titles.
 */
export function getAppDocTitles(): string[] {
  return LATTICE_APP_DOCS.map((d) => d.title);
}
