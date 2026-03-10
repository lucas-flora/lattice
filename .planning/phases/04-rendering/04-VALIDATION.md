---
phase: 4
slug: rendering
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-10
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.mts |
| **Quick run command** | `pnpm vitest run --dir src` |
| **Full suite command** | `pnpm vitest run --dir src` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --dir src`
- **After every plan wave:** Run `pnpm vitest run --dir src`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | RNDR-07 | unit | `pnpm vitest run src/renderer/__tests__/visual-mapper.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | RNDR-04,RNDR-12 | unit | `pnpm vitest run src/renderer/__tests__/lattice-renderer.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | RNDR-01,RNDR-03 | unit | `pnpm vitest run src/renderer/__tests__/lattice-renderer.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | RNDR-05,RNDR-06 | unit | `pnpm vitest run src/renderer/__tests__/camera-controls.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | RNDR-11 | unit | `pnpm vitest run src/components/__tests__/simulation-viewport.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | RNDR-01,RNDR-03 | unit | `pnpm vitest run src/renderer/__tests__/integration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠️ flaky*

---

## Wave 0 Requirements

- Existing test infrastructure covers all phase requirements (vitest + jsdom already configured)
- Three.js constructors work in jsdom environment (verified in Phase 1 three-dispose tests)

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual rendering in browser | RNDR-01 | Requires real WebGL context | Load app, verify GoL cells render as colored quads |
| Smooth pan/zoom | RNDR-05 | Requires mouse interaction | Drag to pan, scroll to zoom, verify smooth interpolation |
| Spacetime diagram | RNDR-03 | Visual correctness | Load Rule 110, verify strip view renders correctly |
| GPU memory cleanup | RNDR-11 | Requires DevTools | Open DevTools, check renderer.info.memory.geometries after unmount/remount |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
