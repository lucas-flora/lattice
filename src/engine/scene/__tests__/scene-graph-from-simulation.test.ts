import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '../SceneGraph';
import { _resetNodeIdCounter, NODE_TYPES } from '../SceneNode';
import { Simulation } from '../../rule/Simulation';
import { _resetTagIdCounter } from '../../expression/ExpressionTagRegistry';
import { loadBuiltinPreset } from '../../preset/builtinPresets';

describe('SceneGraph.fromSimulation', () => {
  beforeEach(() => {
    _resetNodeIdCounter();
    _resetTagIdCounter();
  });

  it('TestSceneGraph_FromSimulation_ConwaysGol_CreatesCorrectTree', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);
    const graph = SceneGraph.fromSimulation(sim, 'conways-gol');

    // Should have one SimRoot
    const roots = graph.getRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].type).toBe(NODE_TYPES.SIM_ROOT);
    expect(roots[0].name).toBe('conways-gol');

    // SimRoot should have children: Environment, Globals, CellType(s)
    const rootChildren = graph.getChildren(roots[0].id);
    expect(rootChildren.length).toBeGreaterThanOrEqual(3); // env + globals + at least 1 cell type

    // Find environment node
    const envNode = rootChildren.find((n) => n.type === NODE_TYPES.ENVIRONMENT);
    expect(envNode).toBeDefined();
    expect(envNode!.name).toBe('Environment');

    // Find globals node
    const globalsNode = rootChildren.find((n) => n.type === NODE_TYPES.GLOBALS);
    expect(globalsNode).toBeDefined();
    expect(globalsNode!.name).toBe('Globals');

    // Find cell type nodes
    const cellNodes = rootChildren.filter((n) => n.type === NODE_TYPES.CELL_TYPE);
    expect(cellNodes.length).toBeGreaterThanOrEqual(1);

    // Cell type should have properties
    const firstCell = cellNodes[0];
    expect(firstCell.properties.cellProperties).toBeDefined();
    expect(Array.isArray(firstCell.properties.cellProperties)).toBe(true);
  });

  it('TestSceneGraph_FromSimulation_EnvironmentNode_HasProperties', () => {
    const preset = loadBuiltinPreset('gray-scott');
    const sim = new Simulation(preset);
    const graph = SceneGraph.fromSimulation(sim);

    const envNode = graph.findByType(NODE_TYPES.ENVIRONMENT)[0];
    expect(envNode).toBeDefined();
    expect(envNode.name).toBe('Environment');
    expect(envNode.properties.paramDefs).toBeDefined();
    expect(envNode.properties.paramValues).toBeDefined();
  });

  it('TestSceneGraph_FromSimulation_SimRootProperties', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);
    const graph = SceneGraph.fromSimulation(sim);

    const root = graph.getRoots()[0];
    expect(root.properties.gridWidth).toBe(preset.grid.width);
    expect(root.properties.dimensionality).toBe(preset.grid.dimensionality);
    expect(root.properties.topology).toBe(preset.grid.topology);
  });

  it('TestSceneGraph_FromSimulation_TagsAttachedToOwners', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);

    // Add a tag to the tag registry
    sim.tagRegistry.add({
      name: 'test-expr',
      owner: { type: 'root' },
      code: 'pass',
      phase: 'post-rule',
      enabled: true,
      source: 'code',
      inputs: [],
      outputs: ['cell.alpha'],
    });

    const graph = SceneGraph.fromSimulation(sim);
    const root = graph.getRoots()[0];

    // Root should have the tag attached
    expect(root.tags.length).toBeGreaterThanOrEqual(1);
  });

  it('TestSceneGraph_FromSimulation_CellTypeTagsAttach', () => {
    const preset = loadBuiltinPreset('conways-gol');
    const sim = new Simulation(preset);

    const cellTypes = sim.typeRegistry.getTypes();
    const firstType = cellTypes[0];

    // Add a tag owned by the first cell type
    sim.tagRegistry.add({
      name: 'fade-on-age',
      owner: { type: 'cell-type', id: firstType.id },
      code: 'self.alpha = clamp(1 - self.age / 100, 0, 1)',
      phase: 'post-rule',
      enabled: true,
      source: 'code',
      inputs: ['cell.age'],
      outputs: ['cell.alpha'],
    });

    const graph = SceneGraph.fromSimulation(sim);
    const cellNode = graph.findByType(NODE_TYPES.CELL_TYPE)[0];
    expect(cellNode.tags.length).toBe(1);
  });
});
