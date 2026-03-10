/**
 * Seed script for CA reference documents in Supabase pgvector.
 *
 * Run: npx tsx scripts/seed-rag.ts
 *
 * Seeds the ca_documents table with:
 * 1. CA reference material (GoL patterns, reaction-diffusion theory, etc.)
 * 2. Built-in preset descriptions (from YAML ai_context fields)
 * 3. Lattice command reference
 *
 * Idempotent: deletes existing documents by source before inserting.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from .env.local
const envPath = resolve(__dirname, '..', '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.warn('Could not load .env.local — using existing env vars');
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables:');
  if (!OPENAI_API_KEY) console.error('  - OPENAI_API_KEY');
  if (!SUPABASE_URL) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// CA reference documents
const CA_REFERENCE_DOCS = [
  {
    title: "Conway's Game of Life Patterns",
    content: `Conway's Game of Life (B3/S23) is a two-state cellular automaton on a 2D grid. Key patterns include:
- Still lifes: Block (2x2), Beehive, Loaf, Boat — stable, unchanging configurations
- Oscillators: Blinker (period 2), Toad (period 2), Pulsar (period 3), Pentadecathlon (period 15)
- Spaceships: Glider (moves diagonally, period 4), LWSS (lightweight spaceship, moves horizontally)
- Guns: Gosper Glider Gun (emits gliders periodically)
- Gardens of Eden: patterns with no predecessor state
The Game of Life is Turing-complete — it can simulate any computation. Random initial patterns typically settle into a mix of still lifes and oscillators with occasional gliders.`,
    category: 'patterns',
    source: 'ca-reference',
  },
  {
    title: 'Elementary Cellular Automata',
    content: `Elementary cellular automata (ECA) are 1D, two-state, nearest-neighbor rules classified by Wolfram. Each rule is numbered 0-255 based on its lookup table.
- Rule 110: Proven Turing-complete by Matthew Cook. Produces complex, Class IV behavior with persistent structures and interactions.
- Rule 30: Produces chaotic, seemingly random patterns from simple initial conditions. Used in random number generation.
- Rule 90: Produces Sierpinski triangle fractal pattern. An additive rule (XOR of neighbors).
- Wolfram Classes: I (fixed), II (periodic), III (chaotic), IV (complex/Turing-complete)
ECA demonstrate how extremely simple local rules can produce complex global behavior. The spacetime diagram shows the 1D state evolving downward over time.`,
    category: 'theory',
    source: 'ca-reference',
  },
  {
    title: 'Reaction-Diffusion Systems',
    content: `Reaction-diffusion systems model chemical reactions with spatial diffusion. The Gray-Scott model uses two chemicals U and V:
- Equations: dU/dt = Du*∇²U - U*V² + F*(1-U), dV/dt = Dv*∇²V + U*V² - (F+k)*V
- Parameters: Du (U diffusion rate), Dv (V diffusion rate), F (feed rate), k (kill rate)
- Pattern types depend on F and k: spots (F≈0.035, k≈0.065), stripes (F≈0.04, k≈0.06), labyrinthine/worm patterns (F≈0.03, k≈0.055), wave patterns (F≈0.014, k≈0.045)
- Turing instability: when diffusion rates differ significantly (Du >> Dv), spatial patterns emerge spontaneously
- The Laplacian ∇² is computed as a weighted average of Moore neighborhood values minus the center cell value
These patterns appear in biology: animal coat patterns, coral growth, and chemical oscillations.`,
    category: 'theory',
    source: 'ca-reference',
  },
  {
    title: "Langton's Ant Behavior",
    content: `Langton's Ant is a 2D Turing machine on a grid of black and white cells:
- Rules: On white cell → turn right 90°, flip cell to black, move forward. On black cell → turn left 90°, flip cell to white, move forward.
- Phase 1 (generations 0-~500): Simple, often symmetric patterns
- Phase 2 (generations ~500-~10000): Seemingly chaotic, pseudo-random behavior. The ant creates an irregular blob.
- Phase 3 (generation ~10000+): Emergent "highway" — the ant builds a diagonal periodic structure that extends indefinitely
- The highway has period 104 and moves diagonally. It always appears regardless of initial conditions (unproven conjecture).
- Multiple ants can interact, creating complex emergent behavior
- Extensions: multi-color variants (Langton's Ant with n states) produce diverse behaviors`,
    category: 'patterns',
    source: 'ca-reference',
  },
  {
    title: "Brian's Brain Dynamics",
    content: `Brian's Brain is a three-state cellular automaton (Off, On, Dying):
- Off → On: if exactly 2 neighbors are On
- On → Dying: always (unconditional)
- Dying → Off: always (unconditional)
- The three-state cycle creates natural "refractory period" — cells cannot re-fire immediately
- Spontaneous pattern formation: from random initial conditions, self-organizing moving structures emerge
- Common patterns: "gliders" (small moving structures), "oscillators," and "rakes" (glider-emitting structures)
- Higher density than GoL: Brian's Brain tends to maintain more active cells over time
- The refractory period (Dying state) prevents the grid from reaching a static equilibrium
- Brian's Brain demonstrates how a simple three-state rule produces dramatically different dynamics than two-state automata`,
    category: 'patterns',
    source: 'ca-reference',
  },
  {
    title: 'Navier-Stokes Fluid Simulation',
    content: `The Navier-Stokes equations describe fluid motion. Lattice's simplified implementation uses:
- Four properties per cell: vx (x-velocity), vy (y-velocity), density, pressure
- Viscosity: controls how quickly velocity gradients smooth out (higher = thicker fluid)
- Diffusion: controls how density spreads through the fluid
- Pressure-velocity coupling: pressure gradient drives velocity, velocity divergence drives pressure
- Simplified update: new_vx = vx + dt * (viscosity * ∇²vx - ∂pressure/∂x + damping)
- Damping (0.999): prevents energy accumulation and numerical instability
- Clamping: velocities to [-10, 10], density to [0, 10], pressure to [-10, 10]
- The Laplacian ∇² approximates spatial derivatives using finite differences on the grid
- This is a pedagogical simplification — not a production-grade CFD solver, but demonstrates key fluid dynamics concepts`,
    category: 'theory',
    source: 'ca-reference',
  },
  {
    title: 'Lattice Command Reference',
    content: `Available commands in Lattice (use in terminal or via AI):

Simulation: sim play (start), sim pause (stop), sim step (one tick), sim step-back (reverse), sim reset (initial state), sim clear (zero grid), sim speed <fps> (set speed, 0=max), sim seek <gen> (jump to generation), sim status (show state)

Presets: preset load <name> (load preset), preset list (show available)
Available presets: conways-gol, rule-110, langtons-ant, brians-brain, gray-scott, navier-stokes

Editing: edit draw <x> <y> (set cell alive), edit erase <x> <y> (set cell dead), edit brush-size <n> (set brush), edit undo, edit redo

View: view zoom <level>, view pan <x> <y>, view fit (zoom to fit)

UI: ui toggle-terminal, ui toggle-param-panel`,
    category: 'commands',
    source: 'lattice-docs',
  },
];

// Built-in preset names
const PRESET_NAMES = [
  'conways-gol',
  'rule-110',
  'langtons-ant',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
];

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data[0].embedding;
}

async function supabaseQuery(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function deleteExistingDocuments(source: string): Promise<void> {
  const response = await supabaseQuery(
    'DELETE',
    `/ca_documents?source=eq.${encodeURIComponent(source)}`,
  );
  if (!response.ok) {
    console.warn(`Warning: Could not delete existing ${source} documents (${response.status})`);
  }
}

async function insertDocument(doc: {
  title: string;
  content: string;
  category: string;
  source: string;
  embedding: number[];
}): Promise<void> {
  const response = await supabaseQuery('POST', '/ca_documents', {
    title: doc.title,
    content: doc.content,
    category: doc.category,
    source: doc.source,
    embedding: doc.embedding,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Insert failed for "${doc.title}": ${response.status} ${text}`);
  }
}

function loadPresetAiContext(presetName: string): { description: string; hints: string[] } | null {
  try {
    const builtinsDir = resolve(__dirname, '..', 'src', 'engine', 'preset', 'builtins');
    const yamlContent = readFileSync(resolve(builtinsDir, `${presetName}.yaml`), 'utf-8');
    const parsed = parseYaml(yamlContent) as {
      meta?: { name?: string; description?: string };
      ai_context?: { description?: string; hints?: string[] };
    };
    if (parsed.ai_context) {
      return {
        description: parsed.ai_context.description ?? parsed.meta?.description ?? '',
        hints: parsed.ai_context.hints ?? [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log('Seeding CA documents into Supabase pgvector...\n');

  let seededCount = 0;

  // Delete existing documents for idempotency
  console.log('Cleaning existing documents...');
  await deleteExistingDocuments('ca-reference');
  await deleteExistingDocuments('builtin-preset');
  await deleteExistingDocuments('lattice-docs');
  await deleteExistingDocuments('lattice-app-docs');

  // Seed CA reference documents
  console.log('Seeding CA reference documents...');
  for (const doc of CA_REFERENCE_DOCS) {
    process.stdout.write(`  Embedding "${doc.title}"...`);
    const embedding = await generateEmbedding(`${doc.title}\n${doc.content}`);
    await insertDocument({ ...doc, embedding });
    console.log(' done');
    seededCount++;
  }

  // Seed preset descriptions from YAML ai_context
  console.log('Seeding preset descriptions...');
  for (const presetName of PRESET_NAMES) {
    const aiContext = loadPresetAiContext(presetName);
    if (aiContext) {
      const content = `${aiContext.description}\n\nKey behaviors:\n${aiContext.hints.map((h) => `- ${h}`).join('\n')}`;
      process.stdout.write(`  Embedding preset "${presetName}"...`);
      const embedding = await generateEmbedding(content);
      await insertDocument({
        title: `${presetName} Preset`,
        content,
        category: 'preset',
        source: 'builtin-preset',
        embedding,
      });
      console.log(' done');
      seededCount++;
    }
  }

  // Seed Lattice app documentation (GUIP-06)
  console.log('Seeding Lattice app documentation...');
  const APP_DOCS = [
    {
      title: 'Lattice App Overview',
      content: 'Lattice is a universal cellular automaton simulator built with Next.js, Three.js, and Rust/WASM. It supports 1D, 2D, and 3D grid simulations with six built-in presets. The app follows the Three Surface Doctrine: every action is accessible via GUI buttons, CLI terminal commands, and the AI assistant.',
      category: 'overview',
      source: 'lattice-app-docs',
    },
    {
      title: 'Grid Engine Architecture',
      content: 'The grid engine uses typed arrays (Float32Array) with ping-pong double buffering. Grids support 1D, 2D, and 3D dimensionalities with configurable topology. The Cell Property System allows cells to have static parameters and computed functions. All engine code is pure TypeScript with zero UI imports.',
      category: 'architecture',
      source: 'lattice-app-docs',
    },
    {
      title: 'Simulation Controls and Keyboard Shortcuts',
      content: 'Controls: Space=Play/Pause, N=Step, B=Step Back, R=Reset, C=Clear, T=Terminal, P=Parameters, F=Fullscreen, S=Split View, ?=Shortcuts, Ctrl+Z=Undo, Ctrl+Shift+Z=Redo. Speed slider adjusts FPS. Timeline scrubber allows navigation to any visited generation.',
      category: 'features',
      source: 'lattice-app-docs',
    },
    {
      title: 'Rendering and Visual Mappings',
      content: 'Unified Three.js InstancedMesh path for 1D/2D/3D grids. Data-driven visual mappings from YAML. Zero-copy typed array reads. GPU resources explicitly disposed. Multi-viewport with independent cameras. 3D orbit controls.',
      category: 'architecture',
      source: 'lattice-app-docs',
    },
    {
      title: 'WASM Acceleration Details',
      content: 'Rust implementations compiled to WASM via wasm-bindgen-cli. Whole-tick API with SharedArrayBuffer. Silent fallback to TypeScript if WASM unavailable. Gray-Scott 512x512 targets <16ms frame time.',
      category: 'architecture',
      source: 'lattice-app-docs',
    },
    {
      title: 'AI Assistant Integration',
      content: 'OpenAI GPT-4o streaming in terminal. Full app state context without raw grid buffers. Command execution via CommandRegistry. Typo detection with Levenshtein distance. RAG retrieval from Supabase pgvector.',
      category: 'features',
      source: 'lattice-app-docs',
    },
    {
      title: 'Parameter Visualization and Screenshot Export',
      content: 'Parameters panel shows live sparkline graphs for Cell Count and Tick Rate. Ring buffer of 200 samples. Screenshot export via camera button or viewport screenshot command. PNG download with timestamp filename.',
      category: 'features',
      source: 'lattice-app-docs',
    },
  ];

  for (const doc of APP_DOCS) {
    process.stdout.write(`  Embedding "${doc.title}"...`);
    const embedding = await generateEmbedding(`${doc.title}\n${doc.content}`);
    await insertDocument({ ...doc, embedding });
    console.log(' done');
    seededCount++;
  }

  console.log(`\nSeeded ${seededCount} documents successfully.`);
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
