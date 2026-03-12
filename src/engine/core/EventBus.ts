/**
 * Typed event bus for engine-to-store communication.
 *
 * Pure TypeScript, zero UI imports. Any component can emit or subscribe.
 * Events carry typed payloads defined by the EngineEventMap.
 */

/** Map of all engine events to their payload types */
export interface EngineEventMap {
  'sim:tick': { generation: number; liveCellCount: number };
  'sim:play': Record<string, never>;
  'sim:pause': Record<string, never>;
  'sim:reset': Record<string, never>;
  'sim:presetLoaded': { name: string; width: number; height: number };
  'sim:speedChange': { fps: number };
  'sim:clear': Record<string, never>;
  'sim:stepBack': { generation: number };
  'sim:seek': { generation: number };
  'sim:paramChanged': { name: string; value: number };
  'sim:paramsReset': Record<string, never>;
  'sim:paramDefsChanged': { defs: Array<{ name: string; label?: string; type: string; default: number; min?: number; max?: number; step?: number }>; values: Record<string, number> };
  'view:change': { zoom?: number; cameraX?: number; cameraY?: number };
  'ui:change': { isTerminalOpen?: boolean; isParamPanelOpen?: boolean; isHotkeyHelpOpen?: boolean };
  'edit:undo': Record<string, never>;
  'edit:redo': Record<string, never>;
  'edit:draw': { x: number; y: number };
  'edit:erase': { x: number; y: number };
}

/** Valid event names */
export type EngineEvent = keyof EngineEventMap;

/** Event handler function type */
export type EventHandler<E extends EngineEvent> = (payload: EngineEventMap[E]) => void;

/**
 * Typed event emitter for the Lattice engine.
 *
 * Provides type-safe event emission and subscription.
 * Lightweight -- no external dependencies.
 */
export class EventBus {
  private listeners: Map<string, Set<EventHandler<EngineEvent>>> = new Map();

  /**
   * Subscribe to an event.
   */
  on<E extends EngineEvent>(event: E, handler: EventHandler<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<EngineEvent>);
  }

  /**
   * Unsubscribe from an event.
   */
  off<E extends EngineEvent>(event: E, handler: EventHandler<E>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<EngineEvent>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event with a typed payload.
   * Does nothing if no listeners are registered -- no errors thrown.
   */
  emit<E extends EngineEvent>(event: E, payload: EngineEventMap[E]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  /**
   * Remove all listeners for all events.
   * Useful for testing cleanup.
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get the count of listeners for a specific event.
   * Useful for testing.
   */
  listenerCount(event: EngineEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Global EventBus singleton */
export const eventBus = new EventBus();
