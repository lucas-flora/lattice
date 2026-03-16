/**
 * Tests for v2 preset schema, serialization, and loading.
 *
 * Covers:
 * - v2 schema validation (valid and invalid presets)
 * - Round-trip: SceneGraph -> serialize to v2 -> deserialize back -> compare
 * - v1 backward compatibility: existing v1 presets still load correctly
 * - v2 loading: a v2 preset object loads into correct SceneGraph
 * - Scene with multiple node types, tags, nested children
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PresetV2Schema } from '../schema';
import type { PresetV2Config, SceneNodeV2 } from '../schema';
import { loadPreset, loadPresetV2, loadPresetAny } from '../loader';
import { serializeSceneGraph } from '../serializer';
import { SceneGraph } from '../../scene/SceneGraph';
import { NODE_TYPES, _resetNodeIdCounter } from '../../scene/SceneNode';

// --- Helpers ---

function makeMinimalV2Preset(): PresetV2Config {
  return {
    schema_version: '2',
    grid: { width: 64, height: 64, topology: 'toroidal' },
    scene: [
      {
        type: NODE_TYPES.SIM_ROOT,
        name: 'My Simulation',
        enabled: true,
        children: [
          {
            type: NODE_TYPES.ENVIRONMENT,
            name: 'Environment',
            enabled: true,
            children: [],
            properties: {
              paramDefs: [
                { name: 'speed', type: 'float', default: 1.0 },
              ],
            },
            tags: [],
          },
          {
            type: NODE_TYPES.CELL_TYPE,
            name: 'Base',
            enabled: true,
            children: [],
            properties: {
              color: '#00ff00',
              cellProperties: [
                { name: 'alive', type: 'bool', default: 0 },
              ],
            },
            tags: [
              {
                name: 'Base Rule',
                code: 'return { alive: 1 };',
                phase: 'rule',
                enabled: true,
                source: 'code',
                inputs: ['cell.*'],
                outputs: ['cell.*'],
              },
            ],
          },
        ],
        properties: {
          gridWidth: 64,
          gridHeight: 64,
          topology: 'toroidal',
          presetName: 'My Simulation',
        },
        tags: [],
      },
    ],
  };
}

function makeComplexV2Preset(): PresetV2Config {
  return {
    schema_version: '2',
    grid: { width: 128, height: 128, topology: 'toroidal' },
    scene: [
      {
        type: NODE_TYPES.SIM_ROOT,
        name: 'Complex Sim',
        enabled: true,
        children: [
          {
            type: NODE_TYPES.ENVIRONMENT,
            name: 'Environment',
            enabled: true,
            children: [],
            properties: {
              paramDefs: [
                { name: 'feedRate', type: 'float', default: 0.055, min: 0, max: 0.1 },
                { name: 'killRate', type: 'float', default: 0.062, min: 0, max: 0.1 },
              ],
            },
            tags: [
              {
                name: 'env-tag',
                code: 'env.feedRate = 0.05',
                phase: 'pre-rule',
                enabled: true,
                source: 'code',
                inputs: [],
                outputs: ['env.feedRate'],
              },
            ],
          },
          {
            type: NODE_TYPES.GLOBALS,
            name: 'Globals',
            enabled: true,
            children: [],
            properties: {
              variableDefs: [
                { name: 'entropy', type: 'float', default: 0 },
              ],
            },
            tags: [],
          },
          {
            type: NODE_TYPES.CELL_TYPE,
            name: 'Particle',
            enabled: true,
            children: [
              {
                type: NODE_TYPES.CELL_TYPE,
                name: 'HotParticle',
                enabled: true,
                children: [],
                properties: {
                  color: '#ff4444',
                  parentType: 'Particle',
                  cellProperties: [
                    { name: 'temperature', type: 'float', default: 100 },
                  ],
                },
                tags: [
                  {
                    name: 'heat-decay',
                    code: 'cell.temperature *= 0.99',
                    phase: 'post-rule',
                    enabled: true,
                    source: 'code',
                    inputs: ['cell.temperature'],
                    outputs: ['cell.temperature'],
                  },
                ],
              },
            ],
            properties: {
              color: '#00ff00',
              cellProperties: [
                { name: 'alive', type: 'bool', default: 0 },
                { name: 'age', type: 'int', default: 0 },
              ],
            },
            tags: [],
          },
          {
            type: NODE_TYPES.GROUP,
            name: 'Controllers',
            enabled: true,
            children: [],
            properties: {},
            tags: [
              {
                name: 'age-to-alpha link',
                code: 'cell.alpha = rangeMap(cell.age, [0, 50], [1, 0])',
                phase: 'pre-rule',
                enabled: true,
                source: 'code',
                inputs: ['cell.age'],
                outputs: ['cell.alpha'],
                linkMeta: {
                  sourceAddress: 'cell.age',
                  sourceRange: [0, 50] as [number, number],
                  targetRange: [1, 0] as [number, number],
                  easing: 'smoothstep',
                },
              },
            ],
          },
        ],
        properties: {
          gridWidth: 128,
          gridHeight: 128,
          topology: 'toroidal',
          presetName: 'Complex Sim',
        },
        tags: [
          {
            name: 'Root Rule',
            code: 'return { alive: 1 };',
            phase: 'rule',
            enabled: true,
            source: 'code',
            inputs: ['cell.*'],
            outputs: ['cell.*'],
          },
        ],
      },
    ],
  };
}

// --- Schema Validation ---

describe('PresetV2Schema — validation', () => {
  it('TestPresetV2Schema_ValidMinimalPreset', () => {
    const preset = makeMinimalV2Preset();
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetV2Schema_ValidComplexPreset', () => {
    const preset = makeComplexV2Preset();
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(true);
  });

  it('TestPresetV2Schema_RejectsEmptyScene', () => {
    const preset = {
      schema_version: '2',
      grid: { width: 64, height: 64, topology: 'toroidal' },
      scene: [],
    };
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetV2Schema_RejectsMissingGrid', () => {
    const preset = {
      schema_version: '2',
      scene: [
        {
          type: 'sim-root',
          name: 'Test',
          children: [],
          properties: {},
          tags: [],
        },
      ],
    };
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetV2Schema_RejectsWrongVersion', () => {
    const preset = {
      schema_version: '1',
      grid: { width: 64, height: 64 },
      scene: [{ type: 'sim-root', name: 'T', children: [], properties: {}, tags: [] }],
    };
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(false);
  });

  it('TestPresetV2Schema_DefaultsOnOptionalFields', () => {
    const preset = {
      schema_version: '2',
      grid: { width: 32, height: 32 },
      scene: [
        {
          type: 'sim-root',
          name: 'Defaults',
          // children, properties, tags, enabled all omitted — should default
        },
      ],
    };
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      const node = result.data.scene[0];
      expect(node.enabled).toBe(true);
      expect(node.children).toEqual([]);
      expect(node.properties).toEqual({});
      expect(node.tags).toEqual([]);
    }
  });

  it('TestPresetV2Schema_TagWithLinkMeta', () => {
    const preset = {
      schema_version: '2',
      grid: { width: 64, height: 64 },
      scene: [
        {
          type: 'sim-root',
          name: 'WithLink',
          tags: [
            {
              name: 'age-link',
              code: 'rangeMap(cell.age, [0,50], [1,0])',
              phase: 'pre-rule',
              source: 'code',
              inputs: ['cell.age'],
              outputs: ['cell.alpha'],
              linkMeta: {
                sourceAddress: 'cell.age',
                sourceRange: [0, 50],
                targetRange: [1, 0],
                easing: 'smoothstep',
              },
            },
          ],
        },
      ],
    };
    const result = PresetV2Schema.safeParse(preset);
    expect(result.success).toBe(true);
    if (result.success) {
      const tag = result.data.scene[0].tags[0];
      expect(tag.linkMeta).toBeDefined();
      expect(tag.linkMeta!.easing).toBe('smoothstep');
    }
  });
});

// --- Loader ---

describe('loadPresetV2 — YAML string parsing', () => {
  it('TestLoaderV2_ValidYamlReturnsConfig', () => {
    const yaml = `
schema_version: "2"
grid:
  width: 64
  height: 64
  topology: toroidal
scene:
  - type: sim-root
    name: "Test Sim"
    children:
      - type: cell-type
        name: Base
        properties:
          color: "#00ff00"
        tags:
          - name: "Rule"
            code: "return 0;"
            phase: rule
`;
    const result = loadPresetV2(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.schema_version).toBe('2');
      expect(result.config.scene).toHaveLength(1);
      expect(result.config.scene[0].name).toBe('Test Sim');
      expect(result.config.scene[0].children).toHaveLength(1);
    }
  });

  it('TestLoaderV2_MalformedYamlReturnsParseError', () => {
    const result = loadPresetV2('{{{{not valid yaml at all}}}}:::');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain('YAML parse error');
    }
  });

  it('TestLoaderV2_InvalidStructureReturnsSchemaErrors', () => {
    const yaml = `
schema_version: "2"
grid:
  width: 64
  height: 64
scene: []
`;
    const result = loadPresetV2(yaml);
    expect(result.valid).toBe(false);
  });
});

// --- loadPresetAny version detection ---

describe('loadPresetAny — version detection', () => {
  it('TestLoaderAny_DetectsV1', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "V1 Test"
grid:
  dimensionality: "2d"
  width: 10
  height: 10
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPresetAny(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.version).toBe('1');
    }
  });

  it('TestLoaderAny_DetectsV2', () => {
    const yaml = `
schema_version: "2"
grid:
  width: 64
  height: 64
scene:
  - type: sim-root
    name: "V2 Test"
`;
    const result = loadPresetAny(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.version).toBe('2');
    }
  });

  it('TestLoaderAny_UnknownVersionFallsToV1Error', () => {
    const yaml = `
schema_version: "99"
grid:
  width: 64
  height: 64
scene:
  - type: sim-root
    name: "Bad"
`;
    const result = loadPresetAny(yaml);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const versionError = result.errors.find(
        (e) => e.path.includes('schema_version'),
      );
      expect(versionError).toBeDefined();
    }
  });
});

// --- v1 Backward Compatibility ---

describe('v1 backward compatibility', () => {
  it('TestV1Compat_ExistingV1PresetStillLoads', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Conway's GoL"
grid:
  dimensionality: "2d"
  width: 128
  height: 128
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
    role: "input_output"
rule:
  type: "typescript"
  compute: "return 0;"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.config.schema_version).toBe('1');
      expect(result.config.meta.name).toBe("Conway's GoL");
    }
  });

  it('TestV1Compat_V1WithScriptingFieldsStillLoads', () => {
    const yaml = `
schema_version: "1"
meta:
  name: "Scripted"
grid:
  dimensionality: "2d"
  width: 8
  height: 8
  topology: "toroidal"
cell_properties:
  - name: "alive"
    type: "bool"
    default: 0
rule:
  type: "typescript"
  compute: "return 0;"
global_variables:
  - name: "entropy"
    type: "float"
    default: 0
global_scripts:
  - name: "counter"
    code: "pass"
`;
    const result = loadPreset(yaml);
    expect(result.valid).toBe(true);
  });
});

// --- SceneGraph.fromPresetV2 ---

describe('SceneGraph.fromPresetV2', () => {
  beforeEach(() => {
    _resetNodeIdCounter();
  });

  it('TestFromPresetV2_CreatesCorrectNodeCount', () => {
    const preset = makeMinimalV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    // SimRoot + Environment + CellType = 3 nodes
    expect(graph.nodeCount).toBe(3);
  });

  it('TestFromPresetV2_TreeStructure', () => {
    const preset = makeMinimalV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    const roots = graph.getRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].type).toBe(NODE_TYPES.SIM_ROOT);
    expect(roots[0].name).toBe('My Simulation');

    const children = graph.getChildren(roots[0].id);
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe(NODE_TYPES.ENVIRONMENT);
    expect(children[1].type).toBe(NODE_TYPES.CELL_TYPE);
  });

  it('TestFromPresetV2_PropertiesPreserved', () => {
    const preset = makeMinimalV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    const cellTypes = graph.findByType(NODE_TYPES.CELL_TYPE);
    expect(cellTypes).toHaveLength(1);
    expect(cellTypes[0].properties.color).toBe('#00ff00');
  });

  it('TestFromPresetV2_TagNamesPreserved', () => {
    const preset = makeMinimalV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    const cellTypes = graph.findByType(NODE_TYPES.CELL_TYPE);
    expect(cellTypes[0].tags).toEqual(['Base Rule']);
  });

  it('TestFromPresetV2_ComplexNestedScene', () => {
    const preset = makeComplexV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    // SimRoot + Environment + Globals + Particle + HotParticle + Controllers = 6
    expect(graph.nodeCount).toBe(6);

    // HotParticle is child of Particle
    const particles = graph.findByName('Particle');
    expect(particles).toHaveLength(1);
    const particleChildren = graph.getChildren(particles[0].id);
    expect(particleChildren).toHaveLength(1);
    expect(particleChildren[0].name).toBe('HotParticle');

    // HotParticle has a tag
    expect(particleChildren[0].tags).toEqual(['heat-decay']);
  });

  it('TestFromPresetV2_ParentChildRelationships', () => {
    const preset = makeComplexV2Preset();
    const graph = SceneGraph.fromPresetV2(preset);

    const hotParticle = graph.findByName('HotParticle')[0];
    const parent = graph.getParent(hotParticle.id);
    expect(parent).not.toBeNull();
    expect(parent!.name).toBe('Particle');

    const grandparent = graph.getParent(parent!.id);
    expect(grandparent).not.toBeNull();
    expect(grandparent!.type).toBe(NODE_TYPES.SIM_ROOT);
  });
});

// --- Round-trip ---

describe('Round-trip: SceneGraph -> v2 -> SceneGraph', () => {
  beforeEach(() => {
    _resetNodeIdCounter();
  });

  it('TestRoundTrip_MinimalScene', () => {
    // Build a SceneGraph manually
    const graph = new SceneGraph();
    const root = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'RoundTrip Test',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 64, gridHeight: 64, topology: 'toroidal', presetName: 'RoundTrip Test' },
      tags: [],
    });

    graph.addNode({
      type: NODE_TYPES.ENVIRONMENT,
      name: 'Environment',
      parentId: root.id,
      childIds: [],
      enabled: true,
      properties: { paramDefs: [] },
      tags: [],
    });

    graph.addNode({
      type: NODE_TYPES.CELL_TYPE,
      name: 'Cell',
      parentId: root.id,
      childIds: [],
      enabled: true,
      properties: { color: '#ff0000' },
      tags: [],
    });

    // Serialize to v2
    const v2 = serializeSceneGraph(graph);
    expect(v2.schema_version).toBe('2');
    expect(v2.grid.width).toBe(64);
    expect(v2.grid.height).toBe(64);
    expect(v2.scene).toHaveLength(1);

    // Deserialize back
    const graph2 = SceneGraph.fromPresetV2(v2);

    // Compare structure
    expect(graph2.nodeCount).toBe(graph.nodeCount);
    expect(graph2.getRoots()).toHaveLength(1);
    expect(graph2.getRoots()[0].name).toBe('RoundTrip Test');
    expect(graph2.getRoots()[0].type).toBe(NODE_TYPES.SIM_ROOT);

    const children2 = graph2.getChildren(graph2.getRoots()[0].id);
    expect(children2).toHaveLength(2);
    expect(children2[0].name).toBe('Environment');
    expect(children2[1].name).toBe('Cell');
    expect(children2[1].properties.color).toBe('#ff0000');
  });

  it('TestRoundTrip_NestedChildren', () => {
    const graph = new SceneGraph();
    const root = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'Nested',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 32, gridHeight: 32, topology: 'finite' },
      tags: [],
    });

    const parent = graph.addNode({
      type: NODE_TYPES.CELL_TYPE,
      name: 'Parent',
      parentId: root.id,
      childIds: [],
      enabled: true,
      properties: { color: '#00ff00' },
      tags: [],
    });

    graph.addNode({
      type: NODE_TYPES.CELL_TYPE,
      name: 'Child',
      parentId: parent.id,
      childIds: [],
      enabled: true,
      properties: { color: '#0000ff', parentType: 'Parent' },
      tags: [],
    });

    // Round-trip
    const v2 = serializeSceneGraph(graph);
    expect(v2.scene[0].children).toHaveLength(1);
    expect(v2.scene[0].children[0].children).toHaveLength(1);
    expect(v2.scene[0].children[0].children[0].name).toBe('Child');

    const graph2 = SceneGraph.fromPresetV2(v2);
    expect(graph2.nodeCount).toBe(3);

    const child = graph2.findByName('Child')[0];
    expect(child).toBeDefined();
    const p = graph2.getParent(child.id);
    expect(p!.name).toBe('Parent');
    const gp = graph2.getParent(p!.id);
    expect(gp!.name).toBe('Nested');
  });

  it('TestRoundTrip_PropertiesIntact', () => {
    const graph = new SceneGraph();
    const root = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'PropTest',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: {
        gridWidth: 256,
        gridHeight: 256,
        topology: 'toroidal',
        dimensionality: '2d',
        presetName: 'PropTest',
      },
      tags: [],
    });

    graph.addNode({
      type: NODE_TYPES.ENVIRONMENT,
      name: 'Env',
      parentId: root.id,
      childIds: [],
      enabled: true,
      properties: {
        paramDefs: [
          { name: 'speed', type: 'float', default: 1.5, min: 0, max: 10 },
        ],
        paramValues: { speed: 2.5 },
      },
      tags: [],
    });

    const v2 = serializeSceneGraph(graph);
    const graph2 = SceneGraph.fromPresetV2(v2);

    const env = graph2.findByType(NODE_TYPES.ENVIRONMENT)[0];
    expect(env.properties.paramDefs).toEqual([
      { name: 'speed', type: 'float', default: 1.5, min: 0, max: 10 },
    ]);
    expect(env.properties.paramValues).toEqual({ speed: 2.5 });
  });

  it('TestRoundTrip_TagsAsStubs', () => {
    // Without a tag registry, tags serialize as stubs
    const graph = new SceneGraph();
    const root = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'TagTest',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 8, gridHeight: 8, topology: 'toroidal' },
      tags: ['tag_1', 'tag_2'],
    });

    const v2 = serializeSceneGraph(graph);
    expect(v2.scene[0].tags).toHaveLength(2);
    // Tags are stubs because no registry was provided
    expect(v2.scene[0].tags[0].name).toBe('tag_1');
    expect(v2.scene[0].tags[1].name).toBe('tag_2');
  });
});

// --- Serializer specifics ---

describe('serializeSceneGraph — specifics', () => {
  beforeEach(() => {
    _resetNodeIdCounter();
  });

  it('TestSerializer_GridExtractedFromSimRoot', () => {
    const graph = new SceneGraph();
    graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'Root',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 512, gridHeight: 256, topology: 'finite' },
      tags: [],
    });

    const v2 = serializeSceneGraph(graph);
    expect(v2.grid).toEqual({ width: 512, height: 256, topology: 'finite' });
  });

  it('TestSerializer_GridOverride', () => {
    const graph = new SceneGraph();
    graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'Root',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 64, gridHeight: 64, topology: 'toroidal' },
      tags: [],
    });

    const v2 = serializeSceneGraph(graph, undefined, {
      width: 1024,
      height: 1024,
      topology: 'finite',
    });
    expect(v2.grid).toEqual({ width: 1024, height: 1024, topology: 'finite' });
  });

  it('TestSerializer_FallbackGridWhenNoSimRoot', () => {
    const graph = new SceneGraph();
    graph.addNode({
      type: NODE_TYPES.GROUP,
      name: 'Group',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: {},
      tags: [],
    });

    const v2 = serializeSceneGraph(graph);
    // Should use fallback defaults
    expect(v2.grid).toEqual({ width: 128, height: 128, topology: 'toroidal' });
  });

  it('TestSerializer_EnabledFlagPreserved', () => {
    const graph = new SceneGraph();
    const root = graph.addNode({
      type: NODE_TYPES.SIM_ROOT,
      name: 'Root',
      parentId: null,
      childIds: [],
      enabled: true,
      properties: { gridWidth: 8, gridHeight: 8, topology: 'toroidal' },
      tags: [],
    });

    graph.addNode({
      type: NODE_TYPES.CELL_TYPE,
      name: 'Disabled',
      parentId: root.id,
      childIds: [],
      enabled: false,
      properties: {},
      tags: [],
    });

    const v2 = serializeSceneGraph(graph);
    expect(v2.scene[0].children[0].enabled).toBe(false);
  });
});

// --- v2 Schema validation for YAML string ---

describe('PresetV2Schema — YAML string validation', () => {
  it('TestV2Loader_ValidatesTagDefaults', () => {
    const yaml = `
schema_version: "2"
grid:
  width: 64
  height: 64
scene:
  - type: sim-root
    name: "Defaults Test"
    tags:
      - name: "minimal-tag"
        code: "x = 1"
`;
    const result = loadPresetV2(yaml);
    expect(result.valid).toBe(true);
    if (result.valid) {
      const tag = result.config.scene[0].tags[0];
      expect(tag.phase).toBe('post-rule');
      expect(tag.enabled).toBe(true);
      expect(tag.source).toBe('code');
      expect(tag.inputs).toEqual([]);
      expect(tag.outputs).toEqual([]);
    }
  });
});
