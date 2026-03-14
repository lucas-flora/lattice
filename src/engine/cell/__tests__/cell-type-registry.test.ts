/**
 * Tests for CellTypeRegistry — type hierarchy, property inheritance, and preset factory.
 */

import { describe, it, expect } from 'vitest';
import { CellTypeRegistry } from '../CellTypeRegistry';
import { CellTypeDefinition } from '../CellTypeDefinition';
import { INHERENT_PROPERTIES } from '../types';
import { loadBuiltinPreset } from '../../preset/builtinPresets';
import { loadPresetOrThrow } from '../../preset/loader';

describe('CellTypeRegistry', () => {
  it('TestCellTypeRegistry_RegisterSingleType', () => {
    const registry = new CellTypeRegistry();
    const def = registry.register({
      id: 'cell',
      name: 'Test Cell',
      color: '#ff0000',
      properties: [{ name: 'energy', type: 'float', default: 1.0 }],
    });

    expect(def).toBeInstanceOf(CellTypeDefinition);
    expect(def.id).toBe('cell');
    expect(def.name).toBe('Test Cell');
    expect(def.color).toBe('#ff0000');
    expect(registry.typeCount).toBe(1);
  });

  it('TestCellTypeRegistry_InherentPropertiesInjected', () => {
    const registry = new CellTypeRegistry();
    registry.register({
      id: 'cell',
      name: 'Test Cell',
      properties: [{ name: 'energy', type: 'float', default: 1.0 }],
    });

    const resolved = registry.resolveProperties('cell');
    const names = resolved.map((p) => p.name);
    expect(names).toContain('alive');
    expect(names).toContain('age');
    expect(names).toContain('alpha');
    expect(names).toContain('_cellType');
    expect(names).toContain('energy');
  });

  it('TestCellTypeRegistry_PropertyUnionIncludesInherents', () => {
    const registry = new CellTypeRegistry();
    registry.register({
      id: 'cell',
      name: 'Test Cell',
      properties: [{ name: 'speed', type: 'float', default: 0.5 }],
    });

    const union = registry.getPropertyUnion();
    const names = union.map((p) => p.name);

    // Should include all 4 inherent + 1 custom
    for (const inherent of INHERENT_PROPERTIES) {
      expect(names).toContain(inherent.name);
    }
    expect(names).toContain('speed');
  });

  it('TestCellTypeRegistry_FromPreset_BackwardCompatible', () => {
    // GoL preset has `alive` as a cell_property — should get a single default type
    const preset = loadBuiltinPreset('conways-gol');
    const registry = CellTypeRegistry.fromPreset(preset);

    expect(registry.typeCount).toBe(1);
    const types = registry.getTypes();
    expect(types[0].id).toBe('default');

    // Union should include inherent props + GoL's alive
    const union = registry.getPropertyUnion();
    const names = union.map((p) => p.name);
    expect(names).toContain('alive');
    expect(names).toContain('age');
    expect(names).toContain('alpha');
    expect(names).toContain('_cellType');
  });

  it('TestCellTypeRegistry_FromPreset_MergesAliveProperty', () => {
    // GoL's preset defines `alive` with specific defaults — those should win over inherent
    const preset = loadBuiltinPreset('conways-gol');
    const registry = CellTypeRegistry.fromPreset(preset);

    const union = registry.getPropertyUnion();
    const aliveProp = union.find((p) => p.name === 'alive');
    expect(aliveProp).toBeDefined();
    // The preset's alive is bool with default 0, role input_output — same as inherent
    // but the key point is the preset definition wins
    expect(aliveProp!.type).toBe('bool');
    expect(aliveProp!.default).toBe(0);
  });

  it('TestCellTypeRegistry_IsInherent', () => {
    const registry = new CellTypeRegistry();
    expect(registry.isInherent('alive')).toBe(true);
    expect(registry.isInherent('age')).toBe(true);
    expect(registry.isInherent('alpha')).toBe(true);
    expect(registry.isInherent('_cellType')).toBe(true);
    expect(registry.isInherent('energy')).toBe(false);
    expect(registry.isInherent('state')).toBe(false);
  });

  it('TestCellTypeRegistry_DuplicateIdThrows', () => {
    const registry = new CellTypeRegistry();
    registry.register({ id: 'cell', name: 'Cell A' });
    expect(() => {
      registry.register({ id: 'cell', name: 'Cell B' });
    }).toThrow('Duplicate cell type id');
  });

  it('TestCellTypeRegistry_ParentMustExist', () => {
    const registry = new CellTypeRegistry();
    expect(() => {
      registry.register({ id: 'child', name: 'Child', parent: 'missing' });
    }).toThrow("Parent type 'missing' not found");
  });

  it('TestCellTypeRegistry_SelfParentThrows', () => {
    const registry = new CellTypeRegistry();
    expect(() => {
      registry.register({ id: 'self', name: 'Self', parent: 'self' });
    }).toThrow('cannot be its own parent');
  });

  it('TestCellTypeRegistry_InheritanceChain', () => {
    const registry = new CellTypeRegistry();
    registry.register({
      id: 'base',
      name: 'Base',
      properties: [{ name: 'energy', type: 'float', default: 1.0 }],
    });
    registry.register({
      id: 'derived',
      name: 'Derived',
      parent: 'base',
      properties: [{ name: 'speed', type: 'float', default: 0.5 }],
    });

    const resolved = registry.resolveProperties('derived');
    const names = resolved.map((p) => p.name);
    // Should have inherent + inherited (energy) + own (speed)
    expect(names).toContain('energy');
    expect(names).toContain('speed');
    expect(names).toContain('alive');
  });

  it('TestCellTypeRegistry_DefaultColor', () => {
    const registry = new CellTypeRegistry();
    const def = registry.register({ id: 'cell', name: 'Cell' });
    expect(def.color).toBe('#4ade80');
  });

  it('TestCellTypeRegistry_GetType', () => {
    const registry = new CellTypeRegistry();
    registry.register({ id: 'cell', name: 'Cell' });
    expect(registry.getType('cell')).toBeDefined();
    expect(registry.getType('nonexistent')).toBeUndefined();
  });

  it('TestCellTypeRegistry_FromPreset_GrayScott_NoAlive', () => {
    // Gray-Scott has u, v, no alive — hasInherentAge should be false at engine level
    const preset = loadBuiltinPreset('gray-scott');
    const registry = CellTypeRegistry.fromPreset(preset);

    const union = registry.getPropertyUnion();
    const names = union.map((p) => p.name);
    // Inherent alive is still in the union (always injected)
    expect(names).toContain('alive');
    // But preset's own properties also present
    expect(names).toContain('u');
    expect(names).toContain('v');
  });

  it('TestCellTypeRegistry_FromPreset_WithCellTypes', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Multi-type Test"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_types:
  - id: "predator"
    name: "Predator"
    color: "#ff0000"
    properties:
      - name: "hunger"
        type: "float"
        default: 1.0
  - id: "prey"
    name: "Prey"
    color: "#00ff00"
    properties:
      - name: "speed"
        type: "float"
        default: 0.5
rule:
  type: "typescript"
  compute: "return { alive: 0 };"
`;
    const preset = loadPresetOrThrow(yaml);
    const registry = CellTypeRegistry.fromPreset(preset);

    expect(registry.typeCount).toBe(2);
    const union = registry.getPropertyUnion();
    const names = union.map((p) => p.name);
    expect(names).toContain('hunger');
    expect(names).toContain('speed');
    expect(names).toContain('alive');
  });
});

describe('CellTypeDefinition', () => {
  it('TestCellTypeDefinition_RequiresId', () => {
    expect(() => new CellTypeDefinition({ id: '', name: 'Cell' })).toThrow('non-empty id');
  });

  it('TestCellTypeDefinition_RequiresName', () => {
    expect(() => new CellTypeDefinition({ id: 'cell', name: '' })).toThrow('non-empty name');
  });
});
