import { describe, it, expect } from 'vitest';
import { CellPropertyRegistry } from '../CellPropertyRegistry';

describe('CellPropertyRegistry - registration', () => {
  it('TestRegistry_RegisterProperty', () => {
    const registry = new CellPropertyRegistry();
    const def = registry.register({ name: 'alive', type: 'bool', default: 0 });
    expect(def.name).toBe('alive');
    expect(registry.has('alive')).toBe(true);
    expect(registry.get('alive')).toBe(def);
  });

  it('TestRegistry_DuplicateNameThrows', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'state', type: 'float', default: 0 });
    expect(() =>
      registry.register({ name: 'state', type: 'float', default: 0 }),
    ).toThrow("Property 'state' is already registered");
  });

  it('TestRegistry_RegisterAll', () => {
    const registry = new CellPropertyRegistry();
    registry.registerAll([
      { name: 'alive', type: 'bool', default: 0 },
      { name: 'energy', type: 'float', default: 1.0 },
      { name: 'position', type: 'vec2', default: [0, 0] },
    ]);
    expect(registry.size).toBe(3);
    expect(registry.has('alive')).toBe(true);
    expect(registry.has('energy')).toBe(true);
    expect(registry.has('position')).toBe(true);
  });
});

describe('CellPropertyRegistry - offsets', () => {
  it('TestRegistry_OffsetCalculation_FirstProperty', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'alive', type: 'bool', default: 0 });
    expect(registry.getPropertyOffset('alive')).toBe(0);
  });

  it('TestRegistry_OffsetCalculation_SecondProperty', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'alive', type: 'bool', default: 0 }); // 1 channel
    registry.register({ name: 'energy', type: 'float', default: 0 }); // 1 channel
    expect(registry.getPropertyOffset('alive')).toBe(0);
    expect(registry.getPropertyOffset('energy')).toBe(1);
  });

  it('TestRegistry_OffsetCalculation_ThreeProperties', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'alive', type: 'bool', default: 0 });     // 1 channel, offset 0
    registry.register({ name: 'vel', type: 'vec2', default: [0, 0] });   // 2 channels, offset 1
    registry.register({ name: 'color', type: 'vec3', default: [0, 0, 0] }); // 3 channels, offset 3
    expect(registry.getPropertyOffset('alive')).toBe(0);
    expect(registry.getPropertyOffset('vel')).toBe(1);
    expect(registry.getPropertyOffset('color')).toBe(3);
  });

  it('TestRegistry_OffsetForUnknownPropertyThrows', () => {
    const registry = new CellPropertyRegistry();
    expect(() => registry.getPropertyOffset('nonexistent')).toThrow("not registered");
  });
});

describe('CellPropertyRegistry - totalChannels', () => {
  it('TestRegistry_TotalChannels', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'alive', type: 'bool', default: 0 });     // 1
    registry.register({ name: 'vel', type: 'vec2', default: [0, 0] });   // 2
    registry.register({ name: 'color', type: 'vec3', default: [0, 0, 0] }); // 3
    expect(registry.totalChannels).toBe(6);
  });

  it('TestRegistry_TotalChannels_Empty', () => {
    const registry = new CellPropertyRegistry();
    expect(registry.totalChannels).toBe(0);
  });
});

describe('CellPropertyRegistry - role filtering', () => {
  it('TestRegistry_GetByRole', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'input1', type: 'float', default: 0, role: 'input' });
    registry.register({ name: 'output1', type: 'float', default: 0, role: 'output' });
    registry.register({ name: 'both1', type: 'float', default: 0, role: 'input_output' });
    registry.register({ name: 'input2', type: 'float', default: 0, role: 'input' });

    const inputs = registry.getByRole('input');
    expect(inputs).toHaveLength(2);
    expect(inputs.map((d) => d.name)).toEqual(['input1', 'input2']);

    const outputs = registry.getByRole('output');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].name).toBe('output1');
  });
});

describe('CellPropertyRegistry - ordering', () => {
  it('TestRegistry_GetNames_InRegistrationOrder', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'c', type: 'float', default: 0 });
    registry.register({ name: 'a', type: 'float', default: 0 });
    registry.register({ name: 'b', type: 'float', default: 0 });
    expect(registry.getNames()).toEqual(['c', 'a', 'b']);
  });

  it('TestRegistry_GetAll_InRegistrationOrder', () => {
    const registry = new CellPropertyRegistry();
    registry.register({ name: 'x', type: 'float', default: 0 });
    registry.register({ name: 'y', type: 'float', default: 0 });
    const all = registry.getAll();
    expect(all.map((d) => d.name)).toEqual(['x', 'y']);
  });
});

describe('CellPropertyRegistry - user-defined parity', () => {
  it('TestRegistry_UserDefinedSamePath', () => {
    const registry = new CellPropertyRegistry();

    // "built-in" property
    const builtIn = registry.register({ name: 'alive', type: 'bool', default: 0, role: 'input_output' });

    // "user-defined" property -- uses exact same method
    const userDefined = registry.register({ name: 'custom_energy', type: 'float', default: 1.0, role: 'output' });

    // Both are CellPropertyDefinition instances
    expect(builtIn.constructor).toBe(userDefined.constructor);

    // Both are retrievable the same way
    expect(registry.get('alive')).toBe(builtIn);
    expect(registry.get('custom_energy')).toBe(userDefined);

    // Both appear in getAll
    expect(registry.getAll()).toContain(builtIn);
    expect(registry.getAll()).toContain(userDefined);
  });
});
