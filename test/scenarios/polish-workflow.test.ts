/**
 * Scenario tests for Phase 10: Polish workflows.
 *
 * Tests complete user workflows for keyboard shortcuts, screenshot export,
 * parameter visualization, RAG documentation, and performance benchmarks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../src/engine/core/EventBus';
import { CommandRegistry } from '../../src/commands/CommandRegistry';
import { SimulationController } from '../../src/commands/SimulationController';
import { registerAllCommands } from '../../src/commands/definitions';
import { wireStores } from '../../src/commands/wireStores';
import { useSimStore } from '../../src/store/simStore';
import { useUiStore } from '../../src/store/uiStore';
import { KeyboardShortcutManager, DEFAULT_SHORTCUTS } from '../../src/commands/KeyboardShortcutManager';
import { ParamGraphBuffer, samplesToSparklinePoints } from '../../src/lib/paramGraphData';
import { LATTICE_APP_DOCS } from '../../src/lib/ragDocuments';
import { profileTicks } from '../../src/lib/performanceProfiler';
import { generateScreenshotFilename } from '../../src/lib/screenshotExport';

describe('Polish Workflow Scenarios', () => {
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
  });

  it('TestPolishWorkflow_KeyboardShortcutFullCycle', async () => {
    // Load preset, use keyboard shortcuts for full simulation cycle
    controller.loadPreset('conways-gol');

    // Play via toggle
    await registry.execute('sim.playToggle', {});
    expect(controller.isPlaying()).toBe(true);

    // Pause via toggle
    await registry.execute('sim.playToggle', {});
    expect(controller.isPlaying()).toBe(false);

    // Step forward
    const gen0 = controller.getGeneration();
    await registry.execute('sim.step', {});
    expect(controller.getGeneration()).toBe(gen0 + 1);

    // Step back
    await registry.execute('sim.stepBack', {});
    expect(controller.getGeneration()).toBe(gen0);

    // Reset
    await registry.execute('sim.reset', {});
    expect(controller.getGeneration()).toBe(0);

    // Toggle terminal
    await registry.execute('ui.toggleTerminal', {});
    expect(useUiStore.getState().isTerminalOpen).toBe(true);

    // Toggle param panel
    await registry.execute('ui.toggleParamPanel', {});
    expect(useUiStore.getState().isParamPanelOpen).toBe(true);

    // Toggle hotkey help
    await registry.execute('ui.toggleHotkeyHelp', {});
    expect(useUiStore.getState().isHotkeyHelpOpen).toBe(true);

    // All shortcuts have commands registered
    for (const s of DEFAULT_SHORTCUTS) {
      expect(registry.has(s.commandName)).toBe(true);
    }
  });

  it('TestPolishWorkflow_ParameterGraphLiveUpdate', () => {
    // Simulate running simulation and feeding data to graphs
    controller.loadPreset('conways-gol');
    const cellCountBuffer = new ParamGraphBuffer(200);
    const tickRateBuffer = new ParamGraphBuffer(200);

    // Run 50 ticks and record metrics
    for (let i = 0; i < 50; i++) {
      controller.step();
      const status = controller.getStatus();
      cellCountBuffer.push({ generation: status.generation, value: status.liveCellCount });
      tickRateBuffer.push({ generation: status.generation, value: 10 }); // Mock tick rate
    }

    // Verify graph data
    expect(cellCountBuffer.getCount()).toBe(50);
    expect(tickRateBuffer.getCount()).toBe(50);

    // Generate sparkline points
    const points = samplesToSparklinePoints(cellCountBuffer.getSamples(), 260, 60);
    expect(points.length).toBe(50);

    // First point at x=0, last at x=260
    expect(points[0][0]).toBe(0);
    expect(points[49][0]).toBe(260);

    // Y values should be within canvas bounds
    for (const [, y] of points) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(60);
    }
  });

  it('TestPolishWorkflow_ScreenshotExportViaCli', async () => {
    // Verify screenshot command is available and works (without actual canvas)
    const result = await registry.execute('viewport.screenshot', {});
    // Will fail because no canvas in test environment, but command should be registered
    expect(result.success).toBe(false);
    expect(result.error).toContain('No viewport canvas found');

    // Verify filename generation works
    const filename = generateScreenshotFilename();
    expect(filename).toMatch(/^lattice-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
  });

  it('TestPolishWorkflow_RagDocumentsCoverAllFeatures', () => {
    // Verify RAG docs are suitable for embedding
    const docTitles = LATTICE_APP_DOCS.map((d) => d.title);

    // Must cover core feature areas
    const requiredTopics = ['overview', 'grid', 'render', 'wasm', 'ai', 'shortcut', 'screenshot', 'performance'];
    for (const topic of requiredTopics) {
      const found = LATTICE_APP_DOCS.some(
        (d) => d.title.toLowerCase().includes(topic) || d.content.toLowerCase().includes(topic)
      );
      expect(found, `RAG docs should cover "${topic}"`).toBe(true);
    }

    // All docs have source = lattice-app-docs
    for (const doc of LATTICE_APP_DOCS) {
      expect(doc.source).toBe('lattice-app-docs');
    }

    // Doc count check: comprehensive enough for RAG
    expect(LATTICE_APP_DOCS.length).toBeGreaterThanOrEqual(10);
  });

  it('TestPolishWorkflow_PerformanceBenchmark', () => {
    // Profile simulation ticks
    controller.loadPreset('conways-gol');
    const result = profileTicks(() => { controller.step(); }, 20, 5);

    // Verify profiling ran correctly
    expect(result.tickCount).toBe(20);
    expect(result.avgMs).toBeGreaterThan(0);
    expect(result.fps).toBeGreaterThan(0);

    // After profiling, simulation should have advanced
    expect(controller.getGeneration()).toBeGreaterThanOrEqual(20);
  });
});
