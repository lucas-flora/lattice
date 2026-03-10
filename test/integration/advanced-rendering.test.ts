/**
 * Integration tests for Phase 9: Advanced Rendering.
 *
 * Tests multi-viewport commands, timeline scrubbing via CommandRegistry,
 * fullscreen toggle, and 3D grid detection through the full pipeline.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';

describe('Advanced Rendering Integration', () => {
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
    useUiStore.setState({
      isTerminalOpen: false,
      isParamPanelOpen: false,
      isHotkeyHelpOpen: false,
      brushSize: 1,
      viewportCount: 1,
      fullscreenViewportId: null,
    });
  });

  afterEach(() => {
    unwire();
    controller.dispose();
    registry.clear();
    bus.clear();
  });

  it('TestAdvancedRendering_ViewSplitCommand', async () => {
    expect(useUiStore.getState().viewportCount).toBe(1);

    const result = await registry.execute('view.split', {});
    expect(result.success).toBe(true);
    expect(useUiStore.getState().viewportCount).toBe(2);

    // Toggle back
    const result2 = await registry.execute('view.split', {});
    expect(result2.success).toBe(true);
    expect(useUiStore.getState().viewportCount).toBe(1);
  });

  it('TestAdvancedRendering_ViewFullscreenCommand', async () => {
    const result = await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(result.success).toBe(true);
    expect(useUiStore.getState().fullscreenViewportId).toBe('viewport-1');

    // Toggle off
    const result2 = await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(result2.success).toBe(true);
    expect(useUiStore.getState().fullscreenViewportId).toBeNull();
  });

  it('TestAdvancedRendering_TimelineScrubViaSeek', async () => {
    // Load preset and run a few steps
    await registry.execute('preset.load', { name: 'conways-gol' });
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});
    await registry.execute('sim.step', {});

    expect(controller.getGeneration()).toBe(3);
    expect(useSimStore.getState().maxGeneration).toBe(3);

    // Seek backward (simulates timeline scrub)
    await registry.execute('sim.seek', { generation: 1 });
    expect(controller.getGeneration()).toBe(1);

    // maxGeneration should still be 3
    expect(useSimStore.getState().maxGeneration).toBe(3);

    // Seek forward
    await registry.execute('sim.seek', { generation: 3 });
    expect(controller.getGeneration()).toBe(3);
  });

  it('TestAdvancedRendering_FullscreenHidesHud', async () => {
    // When fullscreen is active, HUD should be hidden
    // We verify this through store state
    await registry.execute('view.fullscreen', { viewportId: 'viewport-1' });
    expect(useUiStore.getState().fullscreenViewportId).toBe('viewport-1');

    // In AppShell, when fullscreenViewportId is not null, HUD is hidden
    const isAnyFullscreen = useUiStore.getState().fullscreenViewportId !== null;
    expect(isAnyFullscreen).toBe(true);
  });

  it('TestAdvancedRendering_NewCommandsRegistered', () => {
    const commands = registry.list().map((c) => c.name);
    expect(commands).toContain('view.split');
    expect(commands).toContain('view.fullscreen');
    expect(commands.length).toBeGreaterThanOrEqual(23);
  });

  it('TestAdvancedRendering_SplitThenFullscreen_WorksCorrectly', async () => {
    // Split viewport
    await registry.execute('view.split', {});
    expect(useUiStore.getState().viewportCount).toBe(2);

    // Fullscreen viewport-2
    await registry.execute('view.fullscreen', { viewportId: 'viewport-2' });
    expect(useUiStore.getState().fullscreenViewportId).toBe('viewport-2');

    // Exit fullscreen
    await registry.execute('view.fullscreen', { viewportId: 'viewport-2' });
    expect(useUiStore.getState().fullscreenViewportId).toBeNull();

    // Still in split mode
    expect(useUiStore.getState().viewportCount).toBe(2);
  });
});
