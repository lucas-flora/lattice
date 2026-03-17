/**
 * UI commands: toggle drawers and panels.
 *
 * Drawers are numbered by hotkey:
 *   ` = terminal (bottom)
 *   1 = Object Manager + Inspector (left)
 *   2 = Card View (left)
 *   3 = Scripting (right)
 *   4 = Metrics (far right)
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import { useLayoutStore, layoutStoreActions } from '../../store/layoutStore';
import { useUiStore } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');
const ToggleParams = z.object({ docked: z.boolean().optional() }).describe('optional docked flag');

export function registerUiCommands(
  registry: CommandRegistry,
  _eventBus: unknown,
): void {
  // --- Terminal (`) ---
  registry.register({
    name: 'ui.toggleTerminal',
    description: 'Toggle terminal panel visibility',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      const { isTerminalOpen, terminalMode } = useLayoutStore.getState();

      if (p?.docked !== undefined) {
        const requestedMode = p.docked ? 'docked' : 'floating';
        if (isTerminalOpen && terminalMode === requestedMode) {
          useLayoutStore.setState({ isTerminalOpen: false });
        } else {
          useLayoutStore.setState({ isTerminalOpen: true, terminalMode: requestedMode });
        }
      } else {
        useLayoutStore.setState({ isTerminalOpen: !isTerminalOpen });
      }
      return { success: true, data: { isTerminalOpen: useLayoutStore.getState().isTerminalOpen } };
    },
  });

  // --- Drawer 1: Object Manager + Inspector ---
  registry.register({
    name: 'ui.toggleLeftDrawer',
    description: 'Toggle drawer 1 (Object Manager + Inspector)',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      layoutStoreActions.toggleDrawer1(p);
      return { success: true, data: { isDrawer1Open: useLayoutStore.getState().isDrawer1Open } };
    },
  });

  // --- Drawer 2: Card View (replaces ParamPanel) ---
  registry.register({
    name: 'ui.toggleParamPanel',
    description: 'Toggle drawer 2 (Card View)',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      layoutStoreActions.toggleDrawer2(p);
      return { success: true, data: { isDrawer2Open: useLayoutStore.getState().isDrawer2Open } };
    },
  });

  // --- Drawer 3: Scripting ---
  registry.register({
    name: 'ui.toggleScriptPanel',
    description: 'Toggle drawer 3 (Scripting)',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      layoutStoreActions.toggleDrawer3(p);
      return { success: true, data: { isDrawer3Open: useLayoutStore.getState().isDrawer3Open } };
    },
  });

  // --- Drawer 4: Metrics ---
  registry.register({
    name: 'ui.toggleMetrics',
    description: 'Toggle drawer 4 (Metrics)',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      layoutStoreActions.toggleDrawer4(p);
      return { success: true, data: { isDrawer4Open: useLayoutStore.getState().isDrawer4Open } };
    },
  });

  // --- Legacy aliases (kept for backward compat) ---
  registry.register({
    name: 'ui.toggleInspector',
    description: 'Toggle inspector (part of drawer 1)',
    category: 'ui',
    params: ToggleParams,
    execute: async (params: unknown) => {
      const p = params as { docked?: boolean } | undefined;
      layoutStoreActions.toggleDrawer1(p);
      return { success: true, data: { isDrawer1Open: useLayoutStore.getState().isDrawer1Open } };
    },
  });

  // --- Node Editor (center tab toggle) ---
  registry.register({
    name: 'ui.toggleNodeEditor',
    description: 'Toggle to node editor tab in center zone',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const { zones } = useLayoutStore.getState();
      const center = zones.center;
      if (center.type === 'tabs') {
        // Find the node editor tab index
        const editorIdx = center.children.findIndex(
          (c) => c.type === 'panel' && c.panelType === 'nodeEditor',
        );
        if (editorIdx >= 0) {
          const newIndex = center.activeIndex === editorIdx ? 0 : editorIdx;
          layoutStoreActions.setZoneLayout('center', {
            ...center,
            activeIndex: newIndex,
          });
          return { success: true, data: { activeIndex: newIndex } };
        }
      }
      return { success: true, data: { activeIndex: 0 } };
    },
  });

  // --- Hotkey Help ---
  registry.register({
    name: 'ui.toggleHotkeyHelp',
    description: 'Toggle keyboard shortcut help overlay',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const current = useUiStore.getState().isHotkeyHelpOpen;
      const next = !current;
      useUiStore.setState({ isHotkeyHelpOpen: next });
      return { success: true, data: { isHotkeyHelpOpen: next } };
    },
  });

  // --- Focus Toggle ---
  registry.register({
    name: 'ui.focusToggle',
    description: 'Switch focus between terminal and simulation',
    category: 'ui',
    params: NoParams,
    execute: async () => {
      const terminalInput = document.querySelector('[data-testid="terminal-input"]') as HTMLElement | null;
      const active = document.activeElement;
      if (active === terminalInput) {
        (active as HTMLElement).blur();
        return { success: true, data: { focus: 'simulation' } };
      } else if (terminalInput) {
        terminalInput.focus();
        return { success: true, data: { focus: 'terminal' } };
      }
      return { success: true, data: { focus: 'unchanged' } };
    },
  });
}
