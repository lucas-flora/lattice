import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { wireStores } from '../wireStores';
import { useSceneStore, sceneStoreActions } from '../../store/sceneStore';
import { _resetNodeIdCounter } from '../../engine/scene/SceneNode';

describe('Scene Commands', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let cleanup: () => void;

  beforeEach(() => {
    _resetNodeIdCounter();
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    cleanup = wireStores(bus);
    sceneStoreActions.resetAll();
  });

  afterEach(() => {
    controller.dispose();
    cleanup();
    registry.clear();
    bus.clear();
  });

  // --- scene.add ---

  it('TestSceneCommand_Add_CreatesNode', async () => {
    const result = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Test Sim',
    });

    expect(result.success).toBe(true);
    const data = result.data as { id: string };
    expect(data.id).toBeDefined();

    const state = useSceneStore.getState();
    expect(state.nodes[data.id]).toBeDefined();
    expect(state.nodes[data.id].name).toBe('Test Sim');
    expect(state.rootIds).toContain(data.id);
  });

  it('TestSceneCommand_Add_WithParent', async () => {
    const rootResult = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Root',
    });
    const rootId = (rootResult.data as { id: string }).id;

    const childResult = await registry.execute('scene.add', {
      type: 'cell-type',
      name: 'Cell',
      parentId: rootId,
    });
    expect(childResult.success).toBe(true);

    const state = useSceneStore.getState();
    const childId = (childResult.data as { id: string }).id;
    expect(state.nodes[rootId].childIds).toContain(childId);
    expect(state.nodes[childId].parentId).toBe(rootId);
  });

  it('TestSceneCommand_Add_InvalidParent_Fails', async () => {
    const result = await registry.execute('scene.add', {
      type: 'cell-type',
      name: 'Orphan',
      parentId: 'nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  // --- scene.remove ---

  it('TestSceneCommand_Remove_DeletesNode', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'group',
      name: 'Temp',
    });
    const id = (addResult.data as { id: string }).id;

    const removeResult = await registry.execute('scene.remove', { id });
    expect(removeResult.success).toBe(true);
    expect(useSceneStore.getState().nodes[id]).toBeUndefined();
  });

  // --- scene.select / deselect ---

  it('TestSceneCommand_Select_UpdatesStore', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Root',
    });
    const id = (addResult.data as { id: string }).id;

    await registry.execute('scene.select', { id });
    expect(useSceneStore.getState().selectedNodeId).toBe(id);

    await registry.execute('scene.deselect', {});
    expect(useSceneStore.getState().selectedNodeId).toBeNull();
  });

  it('TestSceneCommand_Select_InvalidId_Fails', async () => {
    const result = await registry.execute('scene.select', { id: 'ghost' });
    expect(result.success).toBe(false);
  });

  // --- scene.rename ---

  it('TestSceneCommand_Rename_UpdatesName', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Old Name',
    });
    const id = (addResult.data as { id: string }).id;

    await registry.execute('scene.rename', { id, name: 'New Name' });
    expect(useSceneStore.getState().nodes[id].name).toBe('New Name');
  });

  // --- scene.enable / disable ---

  it('TestSceneCommand_Disable_SetsEnabledFalse', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'group',
      name: 'G',
    });
    const id = (addResult.data as { id: string }).id;

    await registry.execute('scene.disable', { id });
    expect(useSceneStore.getState().nodes[id].enabled).toBe(false);

    await registry.execute('scene.enable', { id });
    expect(useSceneStore.getState().nodes[id].enabled).toBe(true);
  });

  // --- scene.expand / collapse ---

  it('TestSceneCommand_ExpandCollapse_UpdatesState', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Root',
    });
    const id = (addResult.data as { id: string }).id;

    await registry.execute('scene.expand', { id });
    expect(useSceneStore.getState().expandedNodeIds).toContain(id);

    await registry.execute('scene.collapse', { id });
    expect(useSceneStore.getState().expandedNodeIds).not.toContain(id);
  });

  // --- scene.move ---

  it('TestSceneCommand_Move_ReparentsNode', async () => {
    const aResult = await registry.execute('scene.add', { type: 'group', name: 'A' });
    const bResult = await registry.execute('scene.add', { type: 'group', name: 'B' });
    const aId = (aResult.data as { id: string }).id;
    const bId = (bResult.data as { id: string }).id;

    const childResult = await registry.execute('scene.add', {
      type: 'cell-type',
      name: 'Cell',
      parentId: aId,
    });
    const childId = (childResult.data as { id: string }).id;

    await registry.execute('scene.move', { id: childId, parentId: bId });

    const state = useSceneStore.getState();
    expect(state.nodes[aId].childIds).not.toContain(childId);
    expect(state.nodes[bId].childIds).toContain(childId);
    expect(state.nodes[childId].parentId).toBe(bId);
  });

  // --- scene.list ---

  it('TestSceneCommand_List_ReturnsAllNodes', async () => {
    await registry.execute('scene.add', { type: 'sim-root', name: 'R' });
    await registry.execute('scene.add', { type: 'group', name: 'G' });

    const result = await registry.execute('scene.list', {});
    expect(result.success).toBe(true);
    const data = result.data as { nodes: unknown[] };
    expect(data.nodes).toHaveLength(2);
  });

  it('TestSceneCommand_List_FiltersByType', async () => {
    await registry.execute('scene.add', { type: 'sim-root', name: 'R' });
    await registry.execute('scene.add', { type: 'group', name: 'G' });

    const result = await registry.execute('scene.list', { type: 'sim-root' });
    const data = result.data as { nodes: unknown[] };
    expect(data.nodes).toHaveLength(1);
  });

  // --- scene.buildTree ---

  it('TestSceneCommand_BuildTree_FromPreset', async () => {
    await registry.execute('preset.load', { name: 'conways-gol' });

    const result = await registry.execute('scene.buildTree', {});
    expect(result.success).toBe(true);

    const state = useSceneStore.getState();
    expect(state.rootIds.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(state.nodes).length).toBeGreaterThanOrEqual(3);
  });

  // --- Events ---

  it('TestSceneCommand_Select_EmitsEvent', async () => {
    const addResult = await registry.execute('scene.add', {
      type: 'sim-root',
      name: 'Root',
    });
    const id = (addResult.data as { id: string }).id;

    let eventPayload: { id: string | null } | null = null;
    bus.on('scene:selectionChanged', (p) => {
      eventPayload = p;
    });

    await registry.execute('scene.select', { id });
    expect(eventPayload).toEqual({ id });
  });
});
