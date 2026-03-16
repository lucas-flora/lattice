import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '../SceneGraph';
import { _resetNodeIdCounter, NODE_TYPES } from '../SceneNode';
import type { SceneNodeDef } from '../SceneNode';

function makeNodeDef(overrides: Partial<SceneNodeDef> = {}): SceneNodeDef {
  return {
    type: NODE_TYPES.GROUP,
    name: 'Test Node',
    parentId: null,
    childIds: [],
    enabled: true,
    properties: {},
    tags: [],
    ...overrides,
  };
}

describe('SceneGraph', () => {
  let graph: SceneGraph;

  beforeEach(() => {
    _resetNodeIdCounter();
    graph = new SceneGraph();
  });

  // --- Add ---

  it('TestSceneGraph_AddNode_CreatesWithAutoId', () => {
    const node = graph.addNode(makeNodeDef({ name: 'Root' }));
    expect(node.id).toBe('node_1');
    expect(node.name).toBe('Root');
    expect(graph.getNode('node_1')).toBe(node);
  });

  it('TestSceneGraph_AddNode_WorldLevel_AppearsInRoots', () => {
    const node = graph.addNode(makeNodeDef({ name: 'Root A' }));
    const roots = graph.getRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0].id).toBe(node.id);
  });

  it('TestSceneGraph_AddNode_WithParent_AppearsInChildren', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));

    expect(graph.getChildren(parent.id)).toHaveLength(1);
    expect(graph.getChildren(parent.id)[0].id).toBe(child.id);
    expect(graph.getRoots()).toHaveLength(1);
  });

  // --- Remove ---

  it('TestSceneGraph_RemoveNode_RemovesFromMap', () => {
    const node = graph.addNode(makeNodeDef({ name: 'Temp' }));
    graph.removeNode(node.id);
    expect(graph.getNode(node.id)).toBeUndefined();
    expect(graph.getRoots()).toHaveLength(0);
  });

  it('TestSceneGraph_RemoveNode_RemovesSubtree', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));
    const grandchild = graph.addNode(makeNodeDef({ name: 'Grandchild', parentId: child.id }));

    graph.removeNode(parent.id);

    expect(graph.getNode(parent.id)).toBeUndefined();
    expect(graph.getNode(child.id)).toBeUndefined();
    expect(graph.getNode(grandchild.id)).toBeUndefined();
    expect(graph.nodeCount).toBe(0);
  });

  it('TestSceneGraph_RemoveChild_UpdatesParentChildIds', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));

    graph.removeNode(child.id);

    expect(graph.getChildren(parent.id)).toHaveLength(0);
    expect(graph.getNode(parent.id)!.childIds).toEqual([]);
  });

  // --- Move ---

  it('TestSceneGraph_MoveNode_ReparentsCorrectly', () => {
    const a = graph.addNode(makeNodeDef({ name: 'A' }));
    const b = graph.addNode(makeNodeDef({ name: 'B' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: a.id }));

    graph.moveNode(child.id, b.id);

    expect(graph.getChildren(a.id)).toHaveLength(0);
    expect(graph.getChildren(b.id)).toHaveLength(1);
    expect(graph.getChildren(b.id)[0].id).toBe(child.id);
    expect(child.parentId).toBe(b.id);
  });

  it('TestSceneGraph_MoveNode_ToWorldLevel', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));

    graph.moveNode(child.id, null);

    expect(graph.getChildren(parent.id)).toHaveLength(0);
    expect(graph.getRoots()).toHaveLength(2);
    expect(child.parentId).toBeNull();
  });

  it('TestSceneGraph_MoveNode_AtIndex', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    graph.addNode(makeNodeDef({ name: 'C1', parentId: parent.id }));
    graph.addNode(makeNodeDef({ name: 'C2', parentId: parent.id }));
    const c3 = graph.addNode(makeNodeDef({ name: 'C3', parentId: parent.id }));

    // Move C3 to index 0
    graph.moveNode(c3.id, parent.id, 0);

    const children = graph.getChildren(parent.id);
    expect(children[0].name).toBe('C3');
    expect(children).toHaveLength(3);
  });

  it('TestSceneGraph_MoveNode_PreventsCyclicParent', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));

    expect(() => graph.moveNode(parent.id, child.id)).toThrow('Cannot move a node to its own descendant');
  });

  // --- Query ---

  it('TestSceneGraph_GetParent_ReturnsCorrectParent', () => {
    const parent = graph.addNode(makeNodeDef({ name: 'Parent' }));
    const child = graph.addNode(makeNodeDef({ name: 'Child', parentId: parent.id }));

    expect(graph.getParent(child.id)?.id).toBe(parent.id);
    expect(graph.getParent(parent.id)).toBeNull();
  });

  it('TestSceneGraph_GetAncestors_WalksUpToWorld', () => {
    const root = graph.addNode(makeNodeDef({ name: 'Root', type: NODE_TYPES.SIM_ROOT }));
    const env = graph.addNode(makeNodeDef({ name: 'Env', parentId: root.id, type: NODE_TYPES.ENVIRONMENT }));
    const _ = graph.addNode(makeNodeDef({ name: 'Leaf', parentId: env.id }));

    const ancestors = graph.getAncestors(_.id);
    expect(ancestors).toHaveLength(2);
    expect(ancestors[0].id).toBe(env.id);
    expect(ancestors[1].id).toBe(root.id);
  });

  it('TestSceneGraph_GetSimRoot_FindsContainingRoot', () => {
    const root = graph.addNode(makeNodeDef({ name: 'Sim', type: NODE_TYPES.SIM_ROOT }));
    const child = graph.addNode(makeNodeDef({ name: 'Cell', parentId: root.id, type: NODE_TYPES.CELL_TYPE }));

    expect(graph.getSimRoot(child.id)?.id).toBe(root.id);
    expect(graph.getSimRoot(root.id)?.id).toBe(root.id);
  });

  it('TestSceneGraph_GetSimRoot_ReturnsNullForOrphans', () => {
    const group = graph.addNode(makeNodeDef({ name: 'Group', type: NODE_TYPES.GROUP }));
    expect(graph.getSimRoot(group.id)).toBeNull();
  });

  it('TestSceneGraph_FindByType_ReturnsMatchingNodes', () => {
    graph.addNode(makeNodeDef({ name: 'Env', type: NODE_TYPES.ENVIRONMENT }));
    graph.addNode(makeNodeDef({ name: 'Group', type: NODE_TYPES.GROUP }));
    graph.addNode(makeNodeDef({ name: 'Env2', type: NODE_TYPES.ENVIRONMENT }));

    const envNodes = graph.findByType(NODE_TYPES.ENVIRONMENT);
    expect(envNodes).toHaveLength(2);
  });

  it('TestSceneGraph_FindByName_ReturnsMatchingNodes', () => {
    graph.addNode(makeNodeDef({ name: 'Alpha' }));
    graph.addNode(makeNodeDef({ name: 'Beta' }));
    graph.addNode(makeNodeDef({ name: 'Alpha' }));

    expect(graph.findByName('Alpha')).toHaveLength(2);
    expect(graph.findByName('Gamma')).toHaveLength(0);
  });

  it('TestSceneGraph_NodeCount_TracksCorrectly', () => {
    expect(graph.nodeCount).toBe(0);
    const a = graph.addNode(makeNodeDef({ name: 'A' }));
    const b = graph.addNode(makeNodeDef({ name: 'B' }));
    expect(graph.nodeCount).toBe(2);
    graph.removeNode(a.id);
    expect(graph.nodeCount).toBe(1);
  });

  // --- Serialization ---

  it('TestSceneGraph_Serialization_RoundTrip', () => {
    const root = graph.addNode(makeNodeDef({ name: 'Root', type: NODE_TYPES.SIM_ROOT }));
    const child = graph.addNode(
      makeNodeDef({ name: 'Cell', type: NODE_TYPES.CELL_TYPE, parentId: root.id, properties: { color: '#ff0000' } }),
    );

    const json = graph.toJSON();
    const restored = SceneGraph.fromJSON(json);

    expect(restored.nodeCount).toBe(2);
    expect(restored.getNode(root.id)?.name).toBe('Root');
    expect(restored.getNode(child.id)?.properties.color).toBe('#ff0000');
    expect(restored.getRoots()).toHaveLength(1);
    expect(restored.getChildren(root.id)).toHaveLength(1);
  });

  it('TestSceneGraph_Serialization_PreservesOrder', () => {
    const root = graph.addNode(makeNodeDef({ name: 'Root' }));
    graph.addNode(makeNodeDef({ name: 'A', parentId: root.id }));
    graph.addNode(makeNodeDef({ name: 'B', parentId: root.id }));
    graph.addNode(makeNodeDef({ name: 'C', parentId: root.id }));

    const json = graph.toJSON();
    const restored = SceneGraph.fromJSON(json);
    const children = restored.getChildren(root.id);
    expect(children.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });
});
