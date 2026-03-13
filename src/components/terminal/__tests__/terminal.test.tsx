import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useUiStore } from '@/store/uiStore';
import { useLayoutStore } from '@/store/layoutStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { EventBus } from '@/engine/core/EventBus';
import { SimulationController } from '@/commands/SimulationController';
import { registerAllCommands } from '@/commands/definitions';

/**
 * Terminal component tests.
 *
 * Tests the terminal's command execution, store integration,
 * and component exports. Full DOM rendering deferred to browser.
 */
describe('Terminal Component', () => {
  let bus: EventBus;
  let controller: SimulationController;

  beforeEach(() => {
    bus = new EventBus();
    controller = new SimulationController(bus, 10000);
    commandRegistry.clear();
    registerAllCommands(commandRegistry, controller, bus);
    useLayoutStore.setState({ isTerminalOpen: false, isParamPanelOpen: false });
    useUiStore.setState({ brushSize: 1 });
  });

  afterEach(() => {
    controller.dispose();
    commandRegistry.clear();
    bus.clear();
  });

  it('TestTerminal_ComponentExports', async () => {
    const mod = await import('../Terminal');
    expect(typeof mod.Terminal).toBe('function');
  });

  it('TestTerminal_ToggleCommand_Works', async () => {
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);
    await commandRegistry.execute('ui.toggleTerminal', {});
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);
    await commandRegistry.execute('ui.toggleTerminal', {});
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);
  });

  it('TestTerminal_StoreControlsVisibility', () => {
    useLayoutStore.setState({ isTerminalOpen: true });
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);
  });

  it('TestTerminal_TerminalInputExports', async () => {
    const mod = await import('../TerminalInput');
    expect(typeof mod.TerminalInput).toBe('function');
  });

  it('TestTerminal_TerminalOutputExports', async () => {
    const mod = await import('../TerminalOutput');
    expect(typeof mod.TerminalOutput).toBe('function');
  });

  it('TestTerminal_UseTerminalHookExports', async () => {
    const mod = await import('../useTerminal');
    expect(typeof mod.useTerminal).toBe('function');
  });
});
