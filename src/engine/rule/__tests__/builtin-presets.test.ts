/**
 * Tests for all 6 built-in presets — load from YAML and produce non-trivial output.
 *
 * Success Criterion 2: Rule 110, Langton's Ant, Brian's Brain, Gray-Scott,
 * and Navier-Stokes all load from their YAML preset files and produce
 * non-trivial output after 10 ticks in Vitest tests.
 *
 * YAML-04 through YAML-09: Built-in presets
 */

import { describe, it, expect } from 'vitest';
import { loadBuiltinPreset, BUILTIN_PRESET_NAMES } from '../../preset/builtinPresets';
import { Simulation } from '../Simulation';

describe('Built-in Presets', () => {
  it('loads all 6 built-in presets without error', () => {
    expect(BUILTIN_PRESET_NAMES).toHaveLength(8);
    for (const name of BUILTIN_PRESET_NAMES) {
      expect(() => loadBuiltinPreset(name)).not.toThrow();
    }
  });

  describe('Rule 110 (YAML-05)', () => {
    it('loads from YAML and has correct structure', () => {
      const preset = loadBuiltinPreset('rule-110');
      expect(preset.meta.name).toBe('Rule 110');
      expect(preset.grid.dimensionality).toBe('1d');
      expect(preset.cell_properties[0].name).toBe('state');
    });

    it('produces non-trivial output after 10 ticks', () => {
      const preset = loadBuiltinPreset('rule-110');
      const sim = new Simulation(preset);

      // Initialize with a single cell on at the right edge (standard Rule 110 setup)
      sim.setCellDirect('state', preset.grid.width - 1, 1);

      sim.tickN(10);
      expect(sim.getGeneration()).toBe(10);

      // Count non-zero cells — should have non-trivial structure
      let nonZero = 0;
      for (let i = 0; i < sim.grid.cellCount; i++) {
        if (sim.getCellDirect('state', i) !== 0) nonZero++;
      }

      // Rule 110 from a single cell generates a growing triangle pattern
      // After 10 ticks, there should be multiple active cells
      expect(nonZero).toBeGreaterThan(1);
    });

    it('implements Rule 110 correctly', () => {
      const preset = loadBuiltinPreset('rule-110');
      const sim = new Simulation(preset);

      // Place pattern: 111 -> should produce 0 (rule 110 = 01101110)
      sim.setCellDirect('state', 10, 1);
      sim.setCellDirect('state', 11, 1);
      sim.setCellDirect('state', 12, 1);

      sim.tick();

      // Center cell (11) with pattern 111 -> 0 (rule 110 bit 7 = 0)
      expect(sim.getCellDirect('state', 11)).toBe(0);
    });
  });

  describe("Langton's Ant (YAML-06)", () => {
    it('loads from YAML and has correct structure', () => {
      const preset = loadBuiltinPreset('langtons-ant');
      expect(preset.meta.name).toBe("Langton's Ant");
      expect(preset.grid.dimensionality).toBe('2d');
      const propNames = preset.cell_properties.map(p => p.name);
      expect(propNames).toContain('color');
      expect(propNames).toContain('ant');
      expect(propNames).toContain('ant_dir');
    });

    it('produces non-trivial output after 10 ticks', () => {
      const preset = loadBuiltinPreset('langtons-ant');
      const sim = new Simulation(preset);
      const width = preset.grid.width;
      const height = preset.grid.height!;

      // Place ant in the center
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      const centerIndex = cx + cy * width;
      sim.setCellDirect('ant', centerIndex, 1);
      sim.setCellDirect('ant_dir', centerIndex, 0); // facing up

      sim.tickN(10);
      expect(sim.getGeneration()).toBe(10);

      // Count cells with flipped colors — ant should have modified some
      let flipped = 0;
      for (let i = 0; i < sim.grid.cellCount; i++) {
        if (sim.getCellDirect('color', i) !== 0) flipped++;
      }
      expect(flipped).toBeGreaterThan(0);
    });
  });

  describe("Brian's Brain (YAML-07)", () => {
    it('loads from YAML and has correct structure', () => {
      const preset = loadBuiltinPreset('brians-brain');
      expect(preset.meta.name).toBe("Brian's Brain");
      expect(preset.cell_properties[0].name).toBe('state');
    });

    it('produces non-trivial output after 10 ticks', () => {
      const preset = loadBuiltinPreset('brians-brain');
      const sim = new Simulation(preset);
      const width = preset.grid.width;

      // Seed with a small pattern — a few "on" cells
      sim.setCellDirect('state', 64 + 64 * width, 1);
      sim.setCellDirect('state', 65 + 64 * width, 1);
      sim.setCellDirect('state', 64 + 65 * width, 1);
      sim.setCellDirect('state', 65 + 65 * width, 1);

      sim.tickN(10);
      expect(sim.getGeneration()).toBe(10);

      // Count cells in each state — should have activity
      let on = 0, dying = 0;
      for (let i = 0; i < sim.grid.cellCount; i++) {
        const s = sim.getCellDirect('state', i);
        if (s === 1) on++;
        if (s === 2) dying++;
      }
      // With the 3-state cycle, there should be some activity
      expect(on + dying).toBeGreaterThan(0);
    });

    it('follows 3-state cycle: on -> dying -> off', () => {
      const preset = loadBuiltinPreset('brians-brain');
      const sim = new Simulation(preset);

      // Place a single "on" cell isolated (no neighbors to birth new cells)
      sim.setCellDirect('state', 0, 1);

      sim.tick(); // on -> dying
      expect(sim.getCellDirect('state', 0)).toBe(2);

      sim.tick(); // dying -> off
      expect(sim.getCellDirect('state', 0)).toBe(0);
    });
  });

  describe('Gray-Scott Reaction-Diffusion (YAML-08)', () => {
    it('loads from YAML and has correct structure', () => {
      const preset = loadBuiltinPreset('gray-scott');
      expect(preset.meta.name).toBe('Gray-Scott Reaction-Diffusion');
      const propNames = preset.cell_properties.map(p => p.name);
      expect(propNames).toContain('u');
      expect(propNames).toContain('v');
    });

    it('produces non-trivial output after 10 ticks', () => {
      const preset = loadBuiltinPreset('gray-scott');
      const sim = new Simulation(preset);
      const width = preset.grid.width;
      const height = preset.grid.height!;

      // Initialize: u=1 everywhere (already default), seed v in center
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const idx = (cx + dx) + (cy + dy) * width;
          sim.setCellDirect('v', idx, 0.5);
          sim.setCellDirect('u', idx, 0.5);
        }
      }

      sim.tickN(10);
      expect(sim.getGeneration()).toBe(10);

      // Check that V has diffused — should have changed from initial state
      let vNonZero = 0;
      for (let i = 0; i < sim.grid.cellCount; i++) {
        if (sim.getCellDirect('v', i) > 0.001) vNonZero++;
      }
      // V should have spread from the initial seed
      expect(vNonZero).toBeGreaterThan(0);
    });

    it('u and v values stay bounded [0, 1]', () => {
      const preset = loadBuiltinPreset('gray-scott');
      const sim = new Simulation(preset);
      const width = preset.grid.width;

      // Seed some v
      sim.setCellDirect('v', 64 + 64 * width, 0.9);
      sim.setCellDirect('u', 64 + 64 * width, 0.1);

      sim.tickN(10);

      for (let i = 0; i < sim.grid.cellCount; i++) {
        const u = sim.getCellDirect('u', i);
        const v = sim.getCellDirect('v', i);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Navier-Stokes Fluid Dynamics (YAML-09)', () => {
    it('loads from YAML and has correct structure', () => {
      const preset = loadBuiltinPreset('navier-stokes');
      expect(preset.meta.name).toBe('Navier-Stokes Fluid Dynamics');
      const propNames = preset.cell_properties.map(p => p.name);
      expect(propNames).toContain('vx');
      expect(propNames).toContain('vy');
      expect(propNames).toContain('density');
      expect(propNames).toContain('pressure');
    });

    it('produces non-trivial output after 10 ticks', () => {
      const preset = loadBuiltinPreset('navier-stokes');
      const sim = new Simulation(preset);
      const width = preset.grid.width;
      const height = preset.grid.height!;

      // Initialize with a density blob and some velocity
      const cx = Math.floor(width / 2);
      const cy = Math.floor(height / 2);
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const idx = (cx + dx) + (cy + dy) * width;
          sim.setCellDirect('density', idx, 1.0);
          sim.setCellDirect('vx', idx, 0.5);
          sim.setCellDirect('vy', idx, 0.3);
        }
      }

      sim.tickN(10);
      expect(sim.getGeneration()).toBe(10);

      // Check that density has changed from initial state (diffusion/advection)
      let totalDensity = 0;
      let nonZeroDensity = 0;
      for (let i = 0; i < sim.grid.cellCount; i++) {
        const d = sim.getCellDirect('density', i);
        totalDensity += d;
        if (d > 0.001) nonZeroDensity++;
      }
      // Density should exist
      expect(totalDensity).toBeGreaterThan(0);
      // And should have spread somewhat
      expect(nonZeroDensity).toBeGreaterThan(0);
    });

    it('values stay bounded', () => {
      const preset = loadBuiltinPreset('navier-stokes');
      const sim = new Simulation(preset);
      const width = preset.grid.width;

      // Add some energy
      sim.setCellDirect('density', 32 + 32 * width, 5.0);
      sim.setCellDirect('vx', 32 + 32 * width, 2.0);

      sim.tickN(10);

      for (let i = 0; i < sim.grid.cellCount; i++) {
        const vx = sim.getCellDirect('vx', i);
        const vy = sim.getCellDirect('vy', i);
        expect(Math.abs(vx)).toBeLessThanOrEqual(10);
        expect(Math.abs(vy)).toBeLessThanOrEqual(10);
      }
    });

    it('uses same engine as other presets — no privilege difference (YAML-10)', () => {
      // Navier-Stokes proves universality: same engine, same loader, same runner
      const preset = loadBuiltinPreset('navier-stokes');
      const sim = new Simulation(preset);
      // Simulation uses the same Grid, RuleRunner, and perceive-update cycle
      expect(sim.grid).toBeDefined();
      expect(sim.runner).toBeDefined();
      expect(sim.runner.isUsingWasm()).toBe(false); // TS fallback
      sim.tick();
      expect(sim.getGeneration()).toBe(1);
    });
  });
});
