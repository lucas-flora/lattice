/**
 * Store-event wiring: connects Zustand stores to the EventBus.
 *
 * Each store subscribes to relevant engine events and updates its state
 * accordingly. This is the reactive bridge between the engine and the UI.
 *
 * Call wireStores() once at app initialization.
 * Returns an unsubscribe function for cleanup (useful in tests).
 */

import type { EventBus } from '../engine/core/EventBus';
import { simStoreActions } from '../store/simStore';
import { viewStoreActions } from '../store/viewStore';
import { uiStoreActions } from '../store/uiStore';
// aiStore wiring deferred to Phase 8

/**
 * Wire all Zustand stores to receive EventBus events.
 * Returns a cleanup function that removes all listeners.
 */
export function wireStores(eventBus: EventBus): () => void {
  // --- simStore wiring ---
  const onTick = (payload: { generation: number }) => {
    simStoreActions.setGeneration(payload.generation);
  };

  const onPlay = () => {
    simStoreActions.setIsRunning(true);
  };

  const onPause = () => {
    simStoreActions.setIsRunning(false);
  };

  const onPresetLoaded = (payload: { name: string; width: number; height: number }) => {
    simStoreActions.setActivePreset(payload.name, payload.width, payload.height);
  };

  const onReset = () => {
    simStoreActions.resetState();
  };

  // --- viewStore wiring ---
  const onViewChange = (payload: { zoom?: number; cameraX?: number; cameraY?: number }) => {
    viewStoreActions.updateView(payload);
  };

  // --- uiStore wiring ---
  const onUiChange = (payload: { isTerminalOpen?: boolean; isParamPanelOpen?: boolean }) => {
    uiStoreActions.updateUi(payload);
  };

  // Subscribe to all events
  eventBus.on('sim:tick', onTick);
  eventBus.on('sim:play', onPlay);
  eventBus.on('sim:pause', onPause);
  eventBus.on('sim:presetLoaded', onPresetLoaded);
  eventBus.on('sim:reset', onReset);
  eventBus.on('view:change', onViewChange);
  eventBus.on('ui:change', onUiChange);

  // aiStore: Phase 8 will wire AI-specific events here

  // Return cleanup function
  return () => {
    eventBus.off('sim:tick', onTick);
    eventBus.off('sim:play', onPlay);
    eventBus.off('sim:pause', onPause);
    eventBus.off('sim:presetLoaded', onPresetLoaded);
    eventBus.off('sim:reset', onReset);
    eventBus.off('view:change', onViewChange);
    eventBus.off('ui:change', onUiChange);
  };
}
