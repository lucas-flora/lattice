/**
 * Integration tests for Phase 10: Polish.
 *
 * Tests keyboard shortcuts via CommandRegistry, screenshot command,
 * parameter graph data flow, hotkey help command, and RAG document integration.
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
import { ParamGraphBuffer } from '../../src/lib/paramGraphData';
import { LATTICE_APP_DOCS } from '../../src/lib/ragDocuments';

describe('Polish Integration', () => {
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

  it('TestPolish_AllShortcutCommandsRegistered', () => {
    // Every keyboard shortcut must have its command registered in CommandRegistry
    for (const shortcut of DEFAULT_SHORTCUTS) {
      expect(registry.has(shortcut.commandName)).toBe(true);
    }
  });

  it('TestPolish_PlayToggleCommandWorks', async () => {
    controller.loadPreset('conways-gol');
    const result1 = await registry.execute('sim.playToggle', {});
    expect(result1.success).toBe(true);
    expect(controller.isPlaying()).toBe(true);

    const result2 = await registry.execute('sim.playToggle', {});
    expect(result2.success).toBe(true);
    expect(controller.isPlaying()).toBe(false);
  });

  it('TestPolish_HotkeyHelpToggleCommand', async () => {
    expect(useUiStore.getState().isHotkeyHelpOpen).toBe(false);
    await registry.execute('ui.toggleHotkeyHelp', {});
    expect(useUiStore.getState().isHotkeyHelpOpen).toBe(true);
    await registry.execute('ui.toggleHotkeyHelp', {});
    expect(useUiStore.getState().isHotkeyHelpOpen).toBe(false);
  });

  it('TestPolish_KeyboardShortcutExecutesCommand', async () => {
    controller.loadPreset('conways-gol');
    const manager = new KeyboardShortcutManager(registry);

    // Simulate pressing 'n' for step forward
    const executeSpy = vi.spyOn(registry, 'execute');
    const listeners: Record<string, (e: KeyboardEvent) => void> = {};
    manager.attach({
      addEventListener: (type: string, handler: (e: KeyboardEvent) => void) => {
        listeners[type] = handler;
      },
    });

    listeners['keydown']({
      key: 'n',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      target: { tagName: 'BODY' } as HTMLElement,
    } as unknown as KeyboardEvent);

    expect(executeSpy).toHaveBeenCalledWith('sim.step', {});
  });

  it('TestPolish_ScreenshotCommandRegistered', () => {
    expect(registry.has('viewport.screenshot')).toBe(true);
    const cmd = registry.get('viewport.screenshot');
    expect(cmd?.category).toBe('view');
    expect(cmd?.description).toContain('screenshot');
  });

  it('TestPolish_ParamGraphBufferIntegrationWithSimulation', () => {
    controller.loadPreset('conways-gol');
    const buffer = new ParamGraphBuffer(50);

    // Simulate a series of ticks and record data
    for (let i = 0; i < 10; i++) {
      controller.step();
      const status = controller.getStatus();
      buffer.push({ generation: status.generation, value: status.liveCellCount });
    }

    expect(buffer.getCount()).toBe(10);
    const samples = buffer.getSamples();
    expect(samples[0].generation).toBe(1);
    expect(samples[9].generation).toBe(10);
  });

  it('TestPolish_RagDocumentsComprehensive', () => {
    // Total RAG corpus: Phase 8 CA docs (7) + preset docs (6) + command ref (1) + Phase 10 app docs
    expect(LATTICE_APP_DOCS.length).toBeGreaterThanOrEqual(10);

    // Must cover the major app topics
    const contentJoined = LATTICE_APP_DOCS.map((d) => d.content).join(' ');
    expect(contentJoined).toContain('CommandRegistry');
    expect(contentJoined).toContain('Three.js');
    expect(contentJoined).toContain('WASM');
    expect(contentJoined).toContain('screenshot');
  });

  it('TestPolish_CommandCountIncludesNewCommands', () => {
    // Phase 9 had 23 commands. Phase 10 adds sim.playToggle, ui.toggleHotkeyHelp, viewport.screenshot = 26
    expect(registry.size).toBeGreaterThanOrEqual(26);
  });
});
