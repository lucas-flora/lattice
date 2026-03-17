/**
 * Unit tests for NodeTypeRegistry and builtin node registration.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { nodeTypeRegistry } from '../NodeTypeRegistry';
import { registerBuiltinNodes, ALL_NODES } from '../builtinNodes';

beforeAll(() => {
  registerBuiltinNodes();
});

describe('NodeTypeRegistry', () => {
  it('has all builtin nodes registered', () => {
    for (const node of ALL_NODES) {
      expect(nodeTypeRegistry.has(node.type)).toBe(true);
    }
  });

  it('returns node type definitions by type string', () => {
    const add = nodeTypeRegistry.get('Add');
    expect(add).toBeDefined();
    expect(add!.label).toBe('Add');
    expect(add!.category).toBe('math');
    expect(add!.inputs).toHaveLength(2);
    expect(add!.outputs).toHaveLength(1);
  });

  it('returns undefined for unknown types', () => {
    expect(nodeTypeRegistry.get('NonexistentNode')).toBeUndefined();
  });

  it('filters by category', () => {
    const mathNodes = nodeTypeRegistry.getByCategory('math');
    expect(mathNodes.length).toBeGreaterThan(0);
    for (const node of mathNodes) {
      expect(node.category).toBe('math');
    }
  });

  it('getAll returns all registered nodes', () => {
    const all = nodeTypeRegistry.getAll();
    expect(all.length).toBe(ALL_NODES.length);
  });

  it('has nodes in all categories', () => {
    const categories = new Set(nodeTypeRegistry.getAll().map((n) => n.category));
    expect(categories.has('property')).toBe(true);
    expect(categories.has('math')).toBe(true);
    expect(categories.has('range')).toBe(true);
    expect(categories.has('logic')).toBe(true);
    expect(categories.has('utility')).toBe(true);
  });

  it('PropertyRead has no inputs and one array output', () => {
    const pr = nodeTypeRegistry.get('PropertyRead')!;
    expect(pr.inputs).toHaveLength(0);
    expect(pr.outputs).toHaveLength(1);
    expect(pr.outputs[0].type).toBe('array');
  });

  it('PropertyWrite has one array input and no outputs', () => {
    const pw = nodeTypeRegistry.get('PropertyWrite')!;
    expect(pw.inputs).toHaveLength(1);
    expect(pw.outputs).toHaveLength(0);
  });

  it('Constant has no inputs', () => {
    const c = nodeTypeRegistry.get('Constant')!;
    expect(c.inputs).toHaveLength(0);
    expect(c.hasData).toBe(true);
  });
});
