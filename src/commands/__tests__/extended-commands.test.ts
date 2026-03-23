import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../engine/core/EventBus';
import { CommandRegistry } from '../CommandRegistry';
import { SimulationController } from '../SimulationController';
import { registerAllCommands } from '../definitions';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useViewStore } from '../../store/viewStore';

describe('Extended Commands (Phase 6)', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);

    // Reset store state
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
    useViewStore.setState({ zoom: 1, cameraX: 0, cameraY: 0 });

    // Load a preset for most tests
    controller.loadPreset('conways-gol');
  });

  afterEach(() => {
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  // --- SimulationController extended methods ---

  it.skip('TestSimController_StepBack_ReversesOneGeneration (requires GPU)', () => {
    controller.step(); // gen 0 -> 1
    controller.step(); // gen 1 -> 2
    expect(controller.getGeneration()).toBe(2);

    controller.stepBack(); // gen 2 -> 1
    expect(controller.getGeneration()).toBe(1);
  });

  it('TestSimController_StepBack_NoHistory_NoEffect', () => {
    expect(controller.getGeneration()).toBe(0);
    controller.stepBack(); // Nothing to go back to
    expect(controller.getGeneration()).toBe(0);
  });

  it('TestSimController_Clear_ZerosGrid', () => {
    // Step a few times to populate cells
    controller.step();
    controller.step();

    controller.clear();

    const sim = controller.getSimulation()!;
    const buffer = sim.grid.getCurrentBuffer('alive');
    const allZero = buffer.every((v) => v === 0);
    expect(allZero).toBe(true);
  });

  it('TestSimController_SetSpeed_ChangesInterval', () => {
    controller.setSpeed(30);
    expect(controller.getTickIntervalMs()).toBe(33); // 1000/30 ≈ 33

    controller.setSpeed(60);
    expect(controller.getTickIntervalMs()).toBe(17); // 1000/60 ≈ 17

    controller.setSpeed(0); // max speed
    expect(controller.getTickIntervalMs()).toBe(1);
  });

  it('TestSimController_LiveCellCount_UpdatesOnTick', () => {
    // Set some cells alive manually
    const sim = controller.getSimulation()!;
    sim.setCellDirect('alive', 0, 1);
    sim.setCellDirect('alive', 1, 1);
    sim.setCellDirect('alive', 2, 1);

    expect(controller.getLiveCellCount()).toBe(3);
  });

  it.skip('TestSimController_Status_ReturnsFullState (requires GPU)', () => {
    controller.step();
    const status = controller.getStatus();

    expect(status.generation).toBe(1);
    expect(typeof status.liveCellCount).toBe('number');
    expect(status.isRunning).toBe(false);
    expect(status.activePreset).toBe("Conway's Game of Life");
    expect(typeof status.speed).toBe('number');
  });

  it.skip('TestSimController_Seek_Forward (requires GPU)', () => {
    controller.seek(5);
    expect(controller.getGeneration()).toBe(5);
  });

  it.skip('TestSimController_Seek_Backward (requires GPU)', () => {
    controller.step();
    controller.step();
    controller.step();
    expect(controller.getGeneration()).toBe(3);

    controller.seek(1);
    expect(controller.getGeneration()).toBe(1);
  });

  // --- Extended command registration ---

  it('TestEditDraw_SetsCell', async () => {
    const result = await registry.execute('edit.draw', { x: 5, y: 5 });
    expect(result.success).toBe(true);

    const sim = controller.getSimulation()!;
    const index = sim.grid.coordToIndex(5, 5, 0);
    expect(sim.getCellDirect('alive', index)).toBe(1);
  });

  it('TestEditErase_ClearsCell', async () => {
    // First draw a cell
    await registry.execute('edit.draw', { x: 5, y: 5 });
    const sim = controller.getSimulation()!;
    const index = sim.grid.coordToIndex(5, 5, 0);
    expect(sim.getCellDirect('alive', index)).toBe(1);

    // Then erase it
    const result = await registry.execute('edit.erase', { x: 5, y: 5 });
    expect(result.success).toBe(true);
    expect(sim.getCellDirect('alive', index)).toBe(0);
  });

  it('TestEditDraw_WithBrushSize_SetsMutipleCells', async () => {
    useUiStore.setState({ brushSize: 3 });
    await registry.execute('edit.draw', { x: 5, y: 5 });

    const sim = controller.getSimulation()!;
    // Brush size 3 means 3x3 area centered on (5,5)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const index = sim.grid.coordToIndex(5 + dx, 5 + dy, 0);
        expect(sim.getCellDirect('alive', index)).toBe(1);
      }
    }
  });

  it('TestEditBrushSize_UpdatesStore', async () => {
    const result = await registry.execute('edit.brushSize', { size: 3 });
    expect(result.success).toBe(true);
    expect(useUiStore.getState().brushSize).toBe(3);
  });

  it('TestPresetList_ReturnsAllPresets', async () => {
    const result = await registry.execute('preset.list', {});
    expect(result.success).toBe(true);
    const data = result.data as { presets: string[] };
    expect(data.presets).toHaveLength(9);
    expect(data.presets).toContain('conways-gol');
    expect(data.presets).toContain('rule-110');
    expect(data.presets).toContain('langtons-ant');
    expect(data.presets).toContain('brians-brain');
    expect(data.presets).toContain('gray-scott');
    expect(data.presets).toContain('navier-stokes');
  });

  it.skip('TestSimStepBack_EmitsEvent (requires GPU)', async () => {
    let emitted = false;
    bus.on('sim:stepBack', () => { emitted = true; });

    controller.step();
    controller.stepBack();

    expect(emitted).toBe(true);
  });

  it('TestSimClear_EmitsEvent', async () => {
    let emitted = false;
    bus.on('sim:clear', () => { emitted = true; });

    controller.clear();

    expect(emitted).toBe(true);
  });

  it('TestSimSpeed_EmitsEvent', async () => {
    let emittedFps = -1;
    bus.on('sim:speedChange', (payload) => { emittedFps = payload.fps; });

    controller.setSpeed(30);

    expect(emittedFps).toBe(30);
  });

  it.skip('TestSimStatus_ViaCommand (requires GPU)', async () => {
    controller.step();
    const result = await registry.execute('sim.status', {});
    expect(result.success).toBe(true);
    const data = result.data as { generation: number; liveCellCount: number; isRunning: boolean; activePreset: string | null; speed: number };
    expect(data.generation).toBe(1);
    expect(data.activePreset).toBe("Conway's Game of Life");
  });

  it('TestEditDraw_AutoPausesIfRunning', async () => {
    controller.play();
    expect(controller.isPlaying()).toBe(true);

    await registry.execute('edit.draw', { x: 5, y: 5 });

    expect(controller.isPlaying()).toBe(false);
    controller.pause(); // cleanup
  });

  it('TestEditDraw_Undoable', async () => {
    await registry.execute('edit.draw', { x: 5, y: 5 });
    const sim = controller.getSimulation()!;
    const index = sim.grid.coordToIndex(5, 5, 0);
    expect(sim.getCellDirect('alive', index)).toBe(1);

    // Undo the draw
    await registry.execute('edit.undo', {});
    expect(sim.getCellDirect('alive', index)).toBe(0);
  });

  it.skip('TestSimSeek_ViaCommand (requires GPU)', async () => {
    const result = await registry.execute('sim.seek', { generation: 10 });
    expect(result.success).toBe(true);
    expect(controller.getGeneration()).toBe(10);
  });

  it('TestSimSpeed_ViaCommand', async () => {
    const result = await registry.execute('sim.speed', { fps: 60 });
    expect(result.success).toBe(true);
    expect(controller.getTickIntervalMs()).toBe(17);
  });
});
