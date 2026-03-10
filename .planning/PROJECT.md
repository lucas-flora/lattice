# Lattice

## What This Is

A universal simulation substrate — a domain-agnostic grid engine where cellular automata, Game of Life, fluid dynamics, reaction-diffusion, agent-based models, and any computable rule system are all just YAML configuration files loaded into the same engine. The lattice is the fundamental computational grid underlying all of it, with every action accessible through three equal surfaces: GUI, CLI terminal, and AI assistant.

## Core Value

The engine is universally extensible — any simulation type runs on the same substrate with no special-casing, and users can define, share, and load their own rules as first-class citizens identical to built-in presets.

## Requirements

### Validated

- ✓ Universal grid engine (1D/2D/3D) with configurable dimensions and resolution — v1.0
- ✓ Cell Property System with static parameters and computed functions, composable inputs/outputs — v1.0
- ✓ YAML preset format as the universal API (meta, grid, cell_properties, rule, visual_mappings, ai_context) — v1.0
- ✓ Three Surface Doctrine: every action accessible via GUI, CLI terminal, and AI assistant — v1.0
- ✓ Unified Three.js renderer for 1D/2D/3D visualization — v1.0
- ✓ Data-driven visual layer: any cell property maps to any visual parameter (color, size, shape, orientation) — v1.0
- ✓ Forward/reverse simulation playback with speed control, stepping, and timeline scrubbing — v1.0
- ✓ Built-in presets: Conway's GoL, Rule 110, Langton's Ant, Brian's Brain, Gray-Scott, Navier-Stokes — v1.0
- ✓ CLI terminal with deterministic command trees, ghost-text autocomplete, app logs, and AI chat — v1.0
- ✓ AI assistant with full app state context, Supabase RAG, command execution, personality config — v1.0
- ✓ WASM (Rust) rule execution pipeline for performance-critical simulations — v1.0
- ✓ Multi-viewport system with independent camera/view settings per viewport — v1.0
- ✓ Undo/redo across all surfaces — v1.0
- ✓ HUD contextual menus, hotkeys for all major actions — v1.0
- ✓ Screenshot export — v1.0
- ✓ Performance profiling pass — v1.0

### Active

(None — next milestone requirements TBD via `/gsd:new-milestone`)

### Out of Scope

- Native mobile apps — web-first, responsive design covers mobile
- Real-time multiplayer collaboration — single-user tool
- Server-side simulation execution — all computation runs client-side (browser)
- Custom rendering engines — Three.js is the unified renderer, no alternatives
- GIF animation export — deferred to v2
- CSV/ASCII per-frame export — deferred to v2
- Community preset discovery/upload UI — deferred to v2
- Responsive/mobile layout — deferred to v2
- User preference persistence — deferred to v2
- Python scripting via Pyodide — deferred to v2

## Context

Shipped v1.0 with 16,158 LOC across TypeScript, TSX, and Rust.
Tech stack: Next.js 16 (App Router), TypeScript strict, Tailwind v4, Three.js r183, Zustand v5, OpenAI API (GPT-4o), Supabase pgvector, Rust/WASM via wasm-bindgen-cli, YAML presets, pnpm.
569 tests (503 unit + 16 Rust + 36 integration + 30 scenario) across 10 phases.
26 registered commands, 12 keyboard shortcuts, 6 built-in presets, 13 RAG documents.

## Constraints

- **Tech stack**: Next.js (App Router), TypeScript (strict), Tailwind CSS, Three.js, Zustand, pnpm
- **AI provider**: OpenAI API (GPT-4o) with Supabase pgvector for RAG
- **WASM language**: Rust via wasm-bindgen-cli (NOT wasm-pack — archived Sept 2025)
- **Preset format**: YAML — human-readable, portable, community-shareable
- **Rendering**: Three.js only — unified approach for all dimensions
- **Architecture**: Engine is pure TypeScript with no UI dependencies
- **UI/UX quality**: All frontend work must reference the UI/UX skill at https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git
- **Web Worker**: Simulation loop in dedicated Web Worker from tick zero
- **Three Surface Doctrine**: Build discipline — wire every action to GUI + CLI simultaneously

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three.js for all rendering (1D/2D/3D) | Unified renderer reduces complexity | ✓ Good — single InstancedMesh path for 1D/2D/3D |
| Rust for WASM rule execution | Best performance, strong ecosystem | ✓ Good — wasm-bindgen-cli works well |
| YAML for preset format | Human-readable, portable, community-shareable | ✓ Good — Zod-validated schema versioned from day one |
| Zustand for state management | Lightweight, modular stores | ✓ Good — 4 stores wired via EventBus |
| Supabase pgvector for AI RAG | Managed vector DB with good DX | ✓ Good — 13 docs, match_documents RPC |
| pnpm as package manager | Fast, disk-efficient | ✓ Good |
| Web Worker from tick zero | Cannot be retrofitted cheaply | ✓ Good — simulation never blocks UI |
| CommandRegistry as hub | Three Surface Doctrine enforcement | ✓ Good — 26 commands, all surfaces use same path |
| Perceive-Update rule contract | Clean separation of neighborhood gathering and state update | ✓ Good — all 6 presets use same interface |
| SharedArrayBuffer for WASM bridge | Zero-copy between Worker and renderer | ✓ Good — with COOP/COEP headers |
| Computed functions via new Function() | Simplest path for v1, no sandbox needed | ⚠️ Revisit for v2 security |

---
*Last updated: 2026-03-10 after v1.0 milestone*
