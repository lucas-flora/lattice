/**
 * Validates that all 8 built-in presets transpile through the generic pipeline:
 * YAML rule.compute (Python subset) → PythonParser → IR → validate → WGSL
 */

import { describe, it, expect } from 'vitest';
import { loadBuiltinPreset } from '../../preset/builtinPresets';
import { parsePython } from '../PythonParser';
import { validateIR } from '../validate';
import { generateWGSL, type WGSLCodegenConfig } from '../WGSLCodegen';
import { CHANNELS_PER_TYPE, INHERENT_PROPERTIES } from '../../cell/types';

const PRESETS = [
  'conways-gol',
  'conways-advanced',
  'brians-brain',
  'gray-scott',
  'navier-stokes',
  'langtons-ant',
  'rule-110',
  'link-testbed',
] as const;

describe('Preset transpilation (Phase 6 validation)', () => {
  for (const name of PRESETS) {
    it(`${name}: transpile → validate → WGSL`, () => {
      const preset = loadBuiltinPreset(name);
      const cellProps = (preset.cell_properties ?? []);
      const envParams = (preset.params ?? []).map(p => p.name);
      // Include inherent properties (age, alpha, colorR/G/B) like GPURuleRunner does
      const allProps = [
        ...INHERENT_PROPERTIES.filter(p => p.name !== '_cellType'),
        ...cellProps.filter(p => !INHERENT_PROPERTIES.some(ip => ip.name === p.name)),
      ];
      const context = {
        cellProperties: allProps.map(p => ({
          name: p.name,
          type: 'f32' as const,
          channels: CHANNELS_PER_TYPE[p.type] ?? 1,
        })),
        envParams,
        globalVars: [] as string[],
        neighborhoodType: 'moore' as const,
      };

      // 1. Transpile Python → IR
      const result = parsePython(preset.rule.compute, context);
      expect(result.program.statements.length).toBeGreaterThan(0);

      // 2. Validate IR
      const validation = validateIR(result.program);
      if (!validation.valid) {
        console.error(`${name} validation errors:`, validation.errors.map(e => e.message));
      }
      expect(validation.valid).toBe(true);

      // 3. Generate WGSL
      const layout = cellProps.map((p, i) => ({
        name: p.name,
        offset: i,
        channels: CHANNELS_PER_TYPE[p.type] ?? 1,
        type: 'f32' as const,
      }));
      const config: WGSLCodegenConfig = {
        workgroupSize: [8, 8, 1],
        topology: preset.grid.topology ?? 'toroidal',
        propertyLayout: layout,
        envParams,
        globalParams: [],
      };
      const wgsl = generateWGSL(result.program, config);
      expect(wgsl).toContain('@compute');
      expect(wgsl).toContain('fn main');
    });
  }
});
