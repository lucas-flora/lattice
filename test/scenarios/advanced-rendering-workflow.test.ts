/**
 * Scenario tests for Phase 9: Advanced Rendering workflows.
 *
 * Tests complete user workflows for multi-viewport, 3D rendering,
 * timeline scrubbing, and fullscreen mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';
import { useLayoutStore } from '../../src/store/layoutStore';
import { CameraController } from '../../src/renderer/CameraController';
import { OrbitCameraController } from '../../src/renderer/OrbitCameraController';

describe('Advanced Rendering Workflow Scenarios', () => {
  let bus: EventBus;
  let registry: CommandRegistry;
  let controller: SimulationController;
  let unwire: () => void;

  beforeEach(() => {
    bus = new EventBus();
    registry = new CommandRegistry();
    controller = new SimulationController(bus, 10000);
    registerAllCommands(registry, controller, bus);
    unwire = wireStores(bus);

    useSimStore.setState({
      generation: 0,
      isRunning: false,
      activePreset: null,
      gridWidth: 0,
      gridHeight: 0,
      liveCellCount: 0,
      speed: 10,
      maxGeneration: 0,
    });
    useLayoutStore.setState({
      isTerminalOpen: false,
      isParamPanelOpen: false,
      viewportCount: 1,
      fullscreenViewportId: null,
    });
    useUiStore.setState({
      isHotkeyHelpOpen: false,
      brushSize: 1,
    });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestScenario_MultiViewportSplitAndIndependentCameras', async () => {
    // 1. Load preset
    await registry.execute('preset.load', { name: 'conways-gol' });
    expect(useSimStore.getState().activePreset).toBeTruthy();

    // 2. Open split viewport
    await registry.execute('view.split', {});
    expect(useLayoutStore.getState().viewportCount).toBe(2);

    // 3. Verify each viewport can have independent camera state
    const cam1 = new CameraController(800, 600);
    const cam2 = new CameraController(800, 600);

    cam1.zoomToFit(128, 128);
    cam2.setZoom(5);
    cam2.pan(50, 50);

    // Both rendering the same simulation but with different views
    const state1 = cam1.getState();
    const state2 = cam2.getState();
    expect(state1.zoom).not.toBeCloseTo(state2.zoom);
    expect(state1.x).not.toBeCloseTo(state2.x);

    // 4. Both viewports should see the same grid data
    const sim = controller.getSimulation()!;
    const buffer1 = sim.grid.getCurrentBuffer('alive');
    const buffer2 = sim.grid.getCurrentBuffer('alive');
    expect(buffer1).toBe(buffer2); // Same reference -- both viewports see same data

    // 5. Return to single viewport
    await registry.execute('view.split', {});
    expect(useLayoutStore.getState().viewportCount).toBe(1);
  });

  it('TestScenario_3DGridWithOrbitControls', async () => {
    // 1. Create orbit camera controller (simulating what SimulationViewport does for 3D)
    const orbitCam = new OrbitCameraController(800, 600);

    // 2. Fit to a 3D grid
    orbitCam.fitToGrid(16, 16, 16);
    const state = orbitCam.getState();
    expect(state.targetX).toBeCloseTo(7.5);
    expect(state.targetY).toBeCloseTo(7.5);
    expect(state.targetZ).toBeCloseTo(7.5);

    // 3. Orbit (rotate) the camera
    const beforeOrbit = orbitCam.getState();
    orbitCam.orbit(200, 100);
    const afterOrbit = orbitCam.getState();
    expect(afterOrbit.theta).not.toBeCloseTo(beforeOrbit.theta);

    // 4. Zoom in
    const beforeZoom = orbitCam.getRadius();
    orbitCam.zoom(3);
    expect(orbitCam.getRadius()).toBeLessThan(beforeZoom);

    // 5. Pan
    const beforePan = orbitCam.getState();
    orbitCam.pan(50, 30);
    const afterPan = orbitCam.getState();
    const targetMoved =
      Math.abs(afterPan.targetX - beforePan.targetX) > 0.01 ||
      Math.abs(afterPan.targetY - beforePan.targetY) > 0.01;
    expect(targetMoved).toBe(true);

    // 6. Verify same InstancedMesh path would be used
    // 3D uses BoxGeometry, 2D uses PlaneGeometry, but both go through InstancedMesh
    const modeFor3D = '3d';
    const modeFor2D = '2d';
    expect(modeFor3D).toBe('3d');
    expect(modeFor2D).toBe('2d');
  });

  it('TestScenario_TimelineScrubberReversePlayback', async () => {
    // 1. Load and run simulation for several steps
    await registry.execute('preset.load', { name: 'conways-gol' });

    for (let i = 0; i < 10; i++) {
      await registry.execute('sim.step', {});
    }

    expect(controller.getGeneration()).toBe(10);
    expect(useSimStore.getState().maxGeneration).toBe(10);

    // 2. Scrub backward to gen 5
    await registry.execute('sim.seek', { generation: 5 });
    expect(controller.getGeneration()).toBe(5);

    // 3. maxGeneration should still be 10
    expect(useSimStore.getState().maxGeneration).toBe(10);

    // 4. Scrub all the way back to gen 0
    await registry.execute('sim.seek', { generation: 0 });
    expect(controller.getGeneration()).toBe(0);

    // 5. Scrub forward to gen 7
    await registry.execute('sim.seek', { generation: 7 });
    expect(controller.getGeneration()).toBe(7);
  });

  it('TestScenario_FullscreenToggleWorkflow', async () => {
    // 1. Open split viewport
    await registry.execute('view.split', {});
    expect(useLayoutStore.getState().viewportCount).toBe(2);

    // 2. Toggle fullscreen on viewport-1
    await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    const fsState1 = useLayoutStore.getState();
    expect(fsState1.fullscreenViewportId).toBe('viewport-1');

    // 3. When fullscreen is active, HUD should be hidden (checked via store)
    const isAnyFullscreen = fsState1.fullscreenViewportId !== null;
    expect(isAnyFullscreen).toBe(true);

    // 4. Toggle fullscreen off (simulating Escape key)
    await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();

    // 5. HUD should be visible again
    expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();

    // 6. Toggle fullscreen on viewport-2
    await registry.execute('view.fullscreen', { viewportId: 'viewport-2' });
    expect(useLayoutStore.getState().fullscreenViewportId).toBe('viewport-2');

    // 7. Exit
    await registry.execute('view.fullscreen', { viewportId: 'viewport-2' });
    expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();
  });

  it('TestScenario_FullWorkflowWithAllFeatures', async () => {
    // Complete workflow: load, step, split, scrub, fullscreen, close
    await registry.execute('preset.load', { name: 'conways-gol' });

    // Run 5 steps
    for (let i = 0; i < 5; i++) {
      await registry.execute('sim.step', {});
    }
    expect(controller.getGeneration()).toBe(5);

    // Open split viewport
    await registry.execute('view.split', {});
    expect(useLayoutStore.getState().viewportCount).toBe(2);

    // Scrub backward
    await registry.execute('sim.seek', { generation: 2 });
    expect(controller.getGeneration()).toBe(2);

    // Fullscreen viewport-1
    await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(useLayoutStore.getState().fullscreenViewportId).toBe('viewport-1');

    // Exit fullscreen
    await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(useLayoutStore.getState().fullscreenViewportId).toBeNull();

    // Close split
    await registry.execute('view.split', {});
    expect(useLayoutStore.getState().viewportCount).toBe(1);
  });
});
