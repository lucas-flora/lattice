/**
 * View commands: zoom, pan, fit.
 *
 * Controls viewport camera through the CommandRegistry.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { EventBus } from '../../engine/core/EventBus';
import { useViewStore } from '../../store/viewStore';

const NoParams = z.object({}).describe('none');

const ZoomParams = z.object({
  level: z.number(),
}).describe('{ level: number }');

const PanParams = z.object({
  x: z.number(),
  y: z.number(),
}).describe('{ x: number, y: number }');

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
      // Actual zoom-to-fit calculation happens in the renderer (Phase 6).
      // This command establishes the registry entry.
      eventBus.emit('view:change', {});
      return { success: true };
    },
  });
}
