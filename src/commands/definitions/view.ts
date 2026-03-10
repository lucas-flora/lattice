/**
 * View commands: zoom, pan, fit, split, fullscreen.
 *
 * Controls viewport camera and layout through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { EventBus } from '../../engine/core/EventBus';
import { useViewStore } from '../../store/viewStore';
import { uiStoreActions } from '../../store/uiStore';

const NoParams = z.object({}).describe('none');

const ZoomParams = z.object({
  level: z.number(),
}).describe('{ level: number }');

const PanParams = z.object({
  x: z.number(),
  y: z.number(),
}).describe('{ x: number, y: number }');

const FullscreenParams = z.object({
  viewportId: z.string().optional(),
}).describe('{ viewportId?: string }');

export function registerViewCommands(
  registry: CommandRegistry,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'view.zoom',
    description: 'Set viewport zoom level',
    category: 'view',
    params: ZoomParams,
    execute: async (params) => {
      const { level } = params as z.infer<typeof ZoomParams>;
      useViewStore.setState({ zoom: level });
      eventBus.emit('view:change', { zoom: level });
      return { success: true, data: { zoom: level } };
    },
  });

  registry.register({
    name: 'view.pan',
    description: 'Set viewport camera position',
    category: 'view',
    params: PanParams,
    execute: async (params) => {
      const { x, y } = params as z.infer<typeof PanParams>;
      useViewStore.setState({ cameraX: x, cameraY: y });
      eventBus.emit('view:change', { cameraX: x, cameraY: y });
      return { success: true, data: { x, y } };
    },
  });

  registry.register({
    name: 'view.fit',
    description: 'Zoom to fit entire grid in viewport',
    category: 'view',
    params: NoParams,
    execute: async () => {
      eventBus.emit('view:change', {});
      return { success: true };
    },
  });

  registry.register({
    name: 'view.split',
    description: 'Toggle split viewport (side by side)',
    category: 'view',
    params: NoParams,
    execute: async () => {
      uiStoreActions.toggleSplitView();
      return { success: true };
    },
  });

  registry.register({
    name: 'view.fullscreen',
    description: 'Toggle fullscreen on a viewport',
    category: 'view',
    params: FullscreenParams,
    execute: async (params) => {
      const { viewportId } = params as z.infer<typeof FullscreenParams>;
      const id = viewportId ?? 'viewport-1';
      // Toggle: if already fullscreen, exit
      const { useUiStore } = await import('../../store/uiStore');
      const current = useUiStore.getState().fullscreenViewportId;
      if (current === id) {
        uiStoreActions.setFullscreenViewport(null);
      } else {
        uiStoreActions.setFullscreenViewport(id);
      }
      return { success: true, data: { viewportId: id } };
    },
  });
}
