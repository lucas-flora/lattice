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
import { useExpressionStore } from '../../store/expressionStore';
import { addTab } from '../../layout/LayoutTree';
import { generateLayoutId } from '../../layout/LayoutTree';

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

  // --- Node Editor (open/focus per-op editor tab) ---
  registry.register({
    name: 'ui.toggleNodeEditor',
    description: 'Open or focus node editor tab (creates per-op tabs)',
    category: 'ui',
    params: z.object({
      tagId: z.string().optional(),
      initProperty: z.string().optional(),
    }).describe('{ tagId?: string, initProperty?: string }'),
    execute: async (params) => {
      const { tagId, initProperty } = params as { tagId?: string; initProperty?: string };
      const { zones } = useLayoutStore.getState();
      const center = zones.center;

      if (!tagId) {
        // No tagId: toggle to first node editor tab or do nothing
        if (center.type === 'tabs') {
          const editorIdx = center.children.findIndex(
            (c) => c.type === 'panel' && c.panelType === 'nodeEditor',
          );
          if (editorIdx >= 0) {
            const newIndex = center.activeIndex !== editorIdx ? editorIdx : 0;
            layoutStoreActions.setZoneLayout('center', { ...center, activeIndex: newIndex });
            return { success: true, data: { activeIndex: newIndex } };
          }
        }
        return { success: true, data: { activeIndex: 0 } };
      }

      // Look up tag name for tab label
      const tag = useExpressionStore.getState().tags.find((t) => t.id === tagId);
      const tabLabel = tag ? `Nodes: ${tag.name}` : 'Node Editor';

      if (center.type === 'tabs') {
        // Check if a node editor tab for this tagId already exists
        const existingIdx = center.children.findIndex(
          (c) => c.type === 'panel' && c.panelType === 'nodeEditor'
            && (c.config as Record<string, unknown> | undefined)?.tagId === tagId,
        );
        if (existingIdx >= 0) {
          // Focus the existing tab
          layoutStoreActions.setZoneLayout('center', { ...center, activeIndex: existingIdx });
          return { success: true, data: { activeIndex: existingIdx } };
        }

        // Create a new node editor tab for this tag
        const panelId = generateLayoutId('nodeEditor');
        const config: Record<string, unknown> = { tagId, label: tabLabel };
        if (initProperty) config.initProperty = initProperty;
        const newPanel = {
          type: 'panel' as const,
          id: panelId,
          panelType: 'nodeEditor',
          config,
        };
        const newCenter = addTab(center, center.id, newPanel);
        layoutStoreActions.setZoneLayout('center', newCenter);
        const newIndex = center.children.length; // addTab appends and activates
        return { success: true, data: { activeIndex: newIndex, panelId } };
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
