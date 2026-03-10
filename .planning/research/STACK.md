# Stack Research

**Domain:** Universal simulation substrate web app (cellular automata, fluid dynamics, reaction-diffusion, agent-based models)
**Researched:** 2026-03-10
**Confidence:** HIGH (core decisions verified against official releases and docs)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.1.6 | Full-stack React framework, App Router | Industry standard for React apps in 2026. Turbopack is now the default bundler (stable), delivering 2–5x faster builds and 10x faster Fast Refresh. App Router + React 19.2 is the correct target — not Next.js 15. Node.js 20.9+ required. |
| React | 19.2 (canary) | UI rendering | Next.js 16 bundles React 19.2 canary, which includes View Transitions, `useEffectEvent`, and `<Activity/>`. React Compiler (stable in Next.js 16) enables automatic memoization — critical for simulation loop performance. |
| TypeScript | 5.1+ | Type safety | Required minimum for Next.js 16. Strict mode (`"strict": true`) prevents an entire class of runtime errors in the grid engine. TypeScript 5.x adds const type parameters and improved inference. |
| Tailwind CSS | 4.2.1 | Utility CSS styling | v4 was released January 2025. CSS-first config (`@import "tailwindcss"` only — no JS config file needed), native cascade layers, container queries built-in, and 100x faster incremental builds vs v3. No `tailwind.config.js` needed for standard use. |
| Three.js | 0.183.2 (r183) | WebGL/WebGPU unified renderer for 1D/2D/3D grids | Since r171 (Sept 2025), WebGPU is production-ready with zero-config import (`three/webgpu`) and automatic WebGL 2 fallback. TSL (Three Shader Language) compiles to both WGSL and GLSL from one codebase. Compute shaders via WebGPU enable GPU-side grid updates — critical for large fluid sims. 95%+ browser coverage with fallback. |
| Zustand | 5.0.11 | Client state management | v5 is concurrent-safe and compatible with React 19. Lightweight, modular stores are correct for mirroring engine state without owning it. Do NOT use inside React Server Components — client-only. |
| Rust | 1.83+ stable | WASM rule execution engine | Mature, best-in-class for WASM performance. wasm-pack toolchain is the industry standard for Rust → WASM → npm workflow. |
| wasm-pack | 0.14.0 | Rust → WASM build tool | Latest stable (Jan 2025). Supports arbitrary WASM targets, macOS ARM, and custom build profiles. Generates JS bindings + package.json for seamless pnpm integration. |
| wasm-bindgen | 0.2.105 | Rust ↔ JS FFI bridge | Required companion to wasm-pack. Handles type marshaling between Rust and JS (TypedArrays, structs). Use `serde-wasm-bindgen` (0.6.5) for complex data serialization. |
| OpenAI SDK | 6.27.0 | AI assistant API calls | Official Node.js/TypeScript SDK. v6 is stable, actively maintained (weekly releases). Use `openai.responses.*` API with GPT-4o. Structured outputs via `zodResponseFormat` eliminate AI parsing bugs. |
| Supabase JS | 2.79.0+ | Supabase client (auth, db, pgvector) | Node.js 20+ is required from v2.79.0 onward. Use `@supabase/supabase-js` for vector similarity search (pgvector), preset storage, and community uploads. |
| pnpm | 9.x | Package manager | Strict dependency resolution prevents phantom dependency bugs. Content-addressable store is disk-efficient. Required for workspace protocol if adding a Rust `crates/` subpackage. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `yaml` | 2.x | YAML preset parsing/serialization | The modern YAML parser (eemeli/yaml), not js-yaml. Native TypeScript types (no `@types/` needed), YAML 1.2 compliant, browser-safe. Use for all YAML preset loading, validation, and round-trip serialization. Minimum TypeScript 5.9 for typings; add `skipLibCheck: true` for earlier TS. |
| Zod | 4.x | YAML preset schema validation | Released July 2025. Use with `yaml` to parse → validate → type-infer YAML presets. `z.infer<>` gives you a strongly-typed `Preset` type from the schema definition. Use `zodResponseFormat` for OpenAI structured outputs. |
| `@supabase/ssr` | latest | Supabase server-side rendering | Required for Next.js App Router cookie-based auth (replaces deprecated `@supabase/auth-helpers-nextjs`). Handles server/client component boundary for auth tokens. |
| `gif.js` | 0.2.0 | GIF export from canvas | Web Worker-based GIF encoder. Accepts canvas frames directly. Use for the export system. Note: lib is stable but not actively maintained — wrap in an abstraction layer. |
| `@react-three/fiber` | 8.x | React bindings for Three.js | Optional but recommended for component-based scene management. Declarative Three.js object lifecycle. Use if the multi-viewport system benefits from React reconciliation. Only use on client components with `'use client'`. |
| `@react-three/drei` | 9.x | Three.js helpers for R3F | Camera controls, stats, HTML overlays in 3D space. Use alongside R3F if adopted. |
| Vitest | 4.x | Unit/integration testing | Recommended default for Next.js + TypeScript in 2026 (official Next.js docs point to Vitest). Browser Mode is stable in v4. Use for engine logic (pure TS), Zod schemas, and WASM bindings. |
| `@testing-library/react` | latest | React component tests | Standard companion to Vitest for component-level tests. |
| Biome | 1.x | Linting and formatting | Next.js 16 removed `next lint` command — use Biome or ESLint directly. Biome is significantly faster than ESLint + Prettier. Single tool replaces both. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Turbopack | Default bundler (Next.js 16) | No configuration needed — enabled by default in Next.js 16. 2–5x faster builds. For WASM integration, fall back to webpack with `next build --webpack` if async WASM experiments cause issues (known friction point). |
| Rust toolchain | Rust compilation | Install via `rustup`. Target `wasm32-unknown-unknown`. Requires `wasm-opt` (via `wasm-pack`) for production WASM optimization. |
| `wasm-opt` | WASM binary optimization | Bundled with wasm-pack 0.14.0. Reduces WASM binary size by 20–40% in release mode. Always run in release builds. |
| `cargo-watch` | Rust hot-reload during dev | Run `cargo watch -s "wasm-pack build --target web"` to auto-rebuild WASM on Rust file changes. |
| next.config.ts | Webpack WASM config | Even with Turbopack as default, WASM loading requires webpack fallback config: `experiments: { asyncWebAssembly: true }`. This is a known Next.js/Turbopack gap as of early 2026 — watch for native Turbopack WASM support. |

---

## Installation

```bash
# Next.js 16 project (already includes React 19.2, TypeScript, Tailwind v4, ESLint)
pnpm create next-app@latest lattice --typescript --tailwind --app --turbopack

# Three.js
pnpm add three
pnpm add -D @types/three

# State management
pnpm add zustand

# YAML + schema validation
pnpm add yaml zod

# AI
pnpm add openai

# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# GIF export
pnpm add gif.js
pnpm add -D @types/gif.js

# Optional: React Three Fiber
pnpm add @react-three/fiber @react-three/drei

# Dev tools
pnpm add -D vitest @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom
pnpm add -D biome

# Rust/WASM toolchain (system-level, not npm)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack  # v0.14.0
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 (App Router) | Vite + React (SPA) | If server-side features (SSR, API routes for AI proxy, DB) are not needed. Vite has simpler WASM integration (native async WASM in config). For this project, API routes for OpenAI and Supabase make Next.js the right call. |
| Three.js (WebGL/WebGPU) | PixiJS (2D only) | If the project were 2D-only and never needed 3D or GPU compute. Lattice requires 3D support and eventually compute shaders — Three.js is the only choice. |
| Three.js WebGPU renderer | Raw WebGPU (no Three.js) | If maximum GPU performance is needed and Three.js abstraction overhead is measurable. Not justified here — Three.js r183 WebGPU path is production-ready and the TSL shader system is mature. |
| Zustand | Jotai | Both are pmndrs libraries. Jotai is atom-based (better for fine-grained reactivity). Zustand is store-based (better for structured simulation state with slices). Zustand's `subscribeWithSelector` middleware is the right model for "engine state → UI" synchronization. |
| Zustand | Redux Toolkit | Redux is correct for large teams with strict action logging. Overkill for a single-user simulation app. Zustand provides same DevTools integration without boilerplate. |
| wasm-pack + Rust | Emscripten (C/C++) | If existing C/C++ simulation codebases (e.g., libnoise, legacy CA code) need porting. For greenfield, Rust's memory safety and wasm-pack toolchain are strictly better. |
| `yaml` (eemeli) | `js-yaml` (nodeca) | js-yaml is older and does not include TypeScript types natively. `yaml` is YAML 1.2-compliant and more actively maintained. No reason to use js-yaml on a greenfield project. |
| Zod 4 | io-ts / Valibot | Valibot is smaller bundle; io-ts is functional. Zod 4 has the best TypeScript inference, official OpenAI `zodResponseFormat` integration, and widest ecosystem adoption. |
| Vitest | Jest | Jest requires more configuration for ESM + TypeScript projects. Vitest is the Next.js docs-recommended testing tool for App Router projects as of 2026. |
| Biome | ESLint + Prettier | ESLint is still viable but requires two separate tools. Next.js 16 removed `next lint` wrapper — use Biome for a single fast tool, or configure ESLint + Prettier separately. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Next.js 15 (targeting it specifically) | Next.js 16 released October 2025 and is the current stable version. Turbopack is now stable and default. React Compiler support is stable. No reason to target 15. | Next.js 16.1.6 |
| Tailwind CSS v3 | v4 is the current release (Jan 2025) with CSS-first config, 100x faster incremental builds, native container queries. v3 requires a `tailwind.config.js` and is slower. | Tailwind v4.2.1 |
| `@supabase/auth-helpers-nextjs` | Deprecated. Does not support Next.js App Router cookie handling properly. | `@supabase/ssr` |
| `js-yaml` | Older package with separate `@types/js-yaml` needed. No YAML 1.2 spec compliance. Last major update years ago. | `yaml` (eemeli/yaml) |
| React Server Components for simulation state | Zustand and Three.js are client-only. The grid engine, renderer, and stores all run client-side. Don't attempt to push simulation state through RSC data flow — it will cause hydration mismatches. | `'use client'` boundary at the canvas/engine entry point |
| Canvas 2D API (direct) | For a 1D/2D/3D unified renderer with GPU acceleration, Canvas 2D API cannot scale to large grids or fluid dynamics at acceptable frame rates. Misses the 3D requirement entirely. | Three.js with WebGL/WebGPU |
| Webpack for WASM in production (if avoidable) | Turbopack does not yet support `asyncWebAssembly: true` experiment natively (as of early 2026). WASM loading requires the `--webpack` fallback. Track Turbopack WASM support in Next.js releases and migrate when available. | `next build --webpack` (temporary workaround) |
| OpenAI SDK v4 (legacy) | v6 is the current stable. v4/v5 have breaking API differences and lack the Responses API. | `openai@^6.27.0` |
| Zod v3 (old API) | Zod v4 (July 2025) is the current stable. v4 has better performance and TypeScript 5.x inference. Both versions are in the same npm package at different subpaths during transition; pin to v4. | `zod@^4.0.0` |

---

## Stack Patterns by Variant

**If performance on large grids (512x512+) is required:**
- Use `import * as THREE from 'three/webgpu'` for WebGPU renderer with automatic WebGL fallback
- Write grid update logic in Rust/WASM for CPU path
- Use TSL compute shaders for GPU path (reaction-diffusion, Navier-Stokes)
- Store grid state in `Float32Array` / `Uint8Array` typed arrays — never plain JS objects
- Use `DataTexture` for uploading grid state to GPU each frame

**If the YAML schema changes during development:**
- Zod schema is the single source of truth — update `PresetSchema` first, types derive from it via `z.infer<>`
- Add Zod `.transform()` to handle legacy preset migrations without breaking format changes

**If Turbopack breaks WASM loading:**
- Add `next.config.ts` webpack override: `config.experiments = { asyncWebAssembly: true, layers: true }`
- Set `config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm'`
- Run dev with `next dev --webpack` until Turbopack native WASM lands

**If @react-three/fiber is not used (direct Three.js):**
- Create a `useEffect(() => { /* Three.js scene setup */ }, [])` pattern in a `'use client'` component
- Return a cleanup function that calls `renderer.dispose()`
- Use `useRef` to hold the Three.js objects — not state (avoids re-render cycles)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 16.1.6 | React 19.2 canary, Node.js 20.9+, TypeScript 5.1+ | Turbopack default; webpack still available via `--webpack` flag |
| Three.js 0.183.2 | @react-three/fiber 8.x | R3F must match Three.js major version. R3F 8.x targets Three.js r150+. |
| Zustand 5.0.11 | React 19, Next.js 16 | Client-only. Use `zustand/middleware` for `subscribeWithSelector`, `immer`, `devtools`. |
| wasm-pack 0.14.0 | wasm-bindgen 0.2.105 | Versions must align exactly — wasm-pack pins its own wasm-bindgen internally. Let wasm-pack manage wasm-bindgen version. |
| Zod 4.x | TypeScript 5.5+ (official), 5.1+ (with `skipLibCheck: true`) | `z.infer<>` generic inference requires TS 5.x for best results. |
| `yaml` 2.x | TypeScript 5.9+ for typings | Add `skipLibCheck: true` in tsconfig for TypeScript < 5.9. Core functionality works regardless. |
| `@supabase/supabase-js` 2.79.0+ | Node.js 20+ | Drops Node.js 18. Aligned with Next.js 16's Node.js 20.9+ requirement. |
| OpenAI 6.27.0 | Node.js 18+ (server), modern browsers (client via edge) | Use in Next.js Route Handlers (server-side only) — never expose API key to client. |

---

## Critical Architecture Notes for Stack Integration

**Engine isolation:** The grid engine (TypeScript) must have zero UI imports. Place it in `lib/engine/` and import it from `'use client'` components only. This allows testing engine logic with Vitest in a Node.js environment without React overhead.

**WASM loading pattern:** Next.js dynamic imports work for WASM modules. Use `const wasm = await import('../crates/pkg/lattice_engine')` inside a client component `useEffect`. Never top-level import WASM — it will break SSR.

**Three.js + Next.js:** Three.js accesses `window` and `document` on import. Always gate with `'use client'` and initialize inside `useEffect`. The canvas component must be client-only.

**Zustand slices:** Create separate stores per domain: `useSimulationStore`, `useRendererStore`, `usePresetStore`, `useAIStore`. Avoids the "one giant store" antipattern. Use `subscribeWithSelector` middleware so engine can subscribe to slice changes without causing React re-renders.

**Supabase server vs client:** Use `@supabase/ssr` `createServerClient` in Server Components and Route Handlers. Use `createBrowserClient` in `'use client'` components. Never use the same client instance across the boundary.

---

## Sources

- [Next.js 16 release post](https://nextjs.org/blog/next-16) — version 16.1.6 confirmed, Turbopack stable, React 19.2, Node.js 20.9+ requirement (HIGH confidence)
- [Tailwind CSS releases](https://github.com/tailwindlabs/tailwindcss/releases) — v4.2.1 confirmed (HIGH confidence)
- [Three.js npm](https://www.npmjs.com/package/three) — 0.183.2 (r183) confirmed current (HIGH confidence)
- [Three.js WebGPU production-ready](https://www.utsubo.com/blog/threejs-2026-what-changed) — r171+ WebGPU with `three/webgpu` (MEDIUM confidence — community source, consistent with Three.js forum)
- [Zustand npm](https://www.npmjs.com/package/zustand) — v5.0.11 confirmed (HIGH confidence)
- [OpenAI Node.js SDK releases](https://github.com/openai/openai-node/releases) — v6.27.0 (Mar 5, 2026) confirmed (HIGH confidence)
- [wasm-pack releases](https://github.com/rustwasm/wasm-pack/releases) — v0.14.0 (Jan 20, 2025) confirmed (HIGH confidence)
- [wasm-bindgen docs.rs](https://docs.rs/crate/wasm-bindgen/latest) — 0.2.104-0.2.105 range confirmed (MEDIUM confidence — could not fetch crates.io page directly)
- [Supabase JS GitHub](https://github.com/supabase/supabase-js) — v2.79.0+ drops Node.js 18 (HIGH confidence)
- [Zod GitHub](https://github.com/colinhacks/zod) — v4.0 released July 2025 (HIGH confidence)
- [yaml npm](https://www.npmjs.com/package/yaml) — TypeScript 5.9 typings requirement noted (HIGH confidence)
- [Vitest](https://vitest.dev/) — v4.x, Browser Mode stable in v4 (HIGH confidence)
- [Next.js WASM integration patterns](https://www.danirisdiandita.com/articles/rust-wasm-nextjs) — webpack experiments config (MEDIUM confidence — pattern consistent with Next.js issues tracker)

---

*Stack research for: Universal simulation substrate web app (Lattice)*
*Researched: 2026-03-10*
