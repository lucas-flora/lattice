# Lattice

## What This Is

A universal simulation substrate — a domain-agnostic grid engine where cellular automata, Game of Life, fluid dynamics, reaction-diffusion, agent-based models, and any computable rule system are all just YAML configuration files loaded into the same engine. The lattice is the fundamental computational grid underlying all of it, with every action accessible through three equal surfaces: GUI, CLI terminal, and AI assistant.

## Core Value

The engine is universally extensible — any simulation type runs on the same substrate with no special-casing, and users can define, share, and load their own rules as first-class citizens identical to built-in presets.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Universal grid engine (1D/2D/3D) with configurable dimensions and resolution
- [ ] Cell Property System with static parameters and computed functions, composable inputs/outputs
- [ ] YAML preset format as the universal API (meta, grid, cell_properties, rule, visual_mappings, ai_context)
- [ ] Three Surface Doctrine: every action accessible via GUI, CLI terminal, and AI assistant
- [ ] Unified Three.js renderer for 1D/2D/3D visualization
- [ ] Data-driven visual layer: any cell property maps to any visual parameter (color, size, shape, orientation)
- [ ] Forward/reverse simulation playback with speed control, stepping, and timeline scrubbing
- [ ] Built-in presets: Conway's GoL, Rule 110, Langton's Ant, Brian's Brain, Gray-Scott reaction-diffusion, Navier-Stokes fluid sim
- [ ] CLI terminal with deterministic command trees, ghost-text autocomplete, app logs, and AI chat
- [ ] AI assistant with full app state context, Supabase RAG, command execution on user's behalf, personality config
- [ ] WASM (Rust) rule execution pipeline for performance-critical simulations
- [ ] Multi-viewport system with independent camera/view settings per viewport
- [ ] Export system: GIF, CSV per frame, ASCII art per frame
- [ ] Undo/redo across all surfaces
- [ ] HUD contextual menus, hotkeys for all major actions
- [ ] Community preset discovery/upload
- [ ] Responsive, modular UI with configurable placement and sizing

### Out of Scope

- Native mobile apps — web-first, responsive design covers mobile
- Real-time multiplayer collaboration — single-user tool
- Server-side simulation execution — all computation runs client-side (browser)
- Custom rendering engines — Three.js is the unified renderer, no alternatives

## Context

- The name "Lattice" reflects the fundamental computational grid concept underlying all simulation types
- Performance is critical: grids can be enormous for fluid sims — typed arrays (Float32Array), WASM rule execution, and efficient data structures from day one
- The YAML preset format is the community-facing API — schema must be defined early and treated as a stable contract
- Zustand stores mirror engine state for UI reactivity but the engine is the source of truth
- The terminal component is shared infrastructure handling logs, CLI commands, and AI chat
- The Cell Property System and YAML loader are load-bearing components that everything else depends on

## Constraints

- **Tech stack**: Next.js (App Router), TypeScript (strict), Tailwind CSS, Three.js, Zustand, pnpm
- **AI provider**: OpenAI API (GPT-4o recommended) with Supabase pgvector for RAG
- **WASM language**: Rust via wasm-bindgen-cli (NOT wasm-pack — archived Sept 2025) for performance-critical rule execution
- **Preset format**: YAML — human-readable, portable, community-shareable
- **Rendering**: Three.js only — no separate 2D renderer, unified approach for all dimensions
- **Architecture**: Engine is pure TypeScript with no UI dependencies; UI components are modular and independently testable
- **UI/UX quality**: All frontend work must reference the UI/UX skill at https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git — non-negotiable quality bar
- **Web Worker**: Simulation loop runs in a dedicated Web Worker from the very first tick — load-bearing, cannot be retrofitted
- **Three Surface Doctrine**: Build discipline, not a feature phase — wire every action to GUI + CLI simultaneously as it is built

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three.js for all rendering (1D/2D/3D) | Unified renderer reduces complexity, pays dividends when 3D and multi-view are added | — Pending |
| Rust for WASM rule execution | Mature wasm-pack toolchain, best performance, strong ecosystem | — Pending |
| YAML for preset format | Human-readable, portable, community-shareable, good tooling support | — Pending |
| Zustand for state management | Lightweight, modular stores that mirror engine state without duplicating it | — Pending |
| Supabase pgvector for AI RAG | Managed vector DB with good DX, handles embeddings for docs and CA reference material | — Pending |
| pnpm as package manager | Fast, disk-efficient, strict dependency resolution | — Pending |

---
*Last updated: 2026-03-09 after initialization*
