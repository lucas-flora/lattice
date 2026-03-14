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
import { layoutStoreActions } from '../store/layoutStore';
// aiStore wiring deferred to Phase 8

/**
 * Wire all Zustand stores to receive EventBus events.
 * Returns a cleanup function that removes all listeners.
 */
export function wireStores(eventBus: EventBus): () => void {
  // --- simStore wiring ---
  const onTick = (payload: { generation: number; liveCellCount: number }) => {
    simStoreActions.setTick(payload.generation, payload.liveCellCount);
  };

  const onPlay = () => {
    simStoreActions.setIsRunning(true);
  };

  const onPause = () => {
    simStoreActions.setIsRunning(false);
  };

  const onPresetLoaded = (payload: { name: string; width: number; height: number; cellProperties?: Array<{ name: string; type: string; default: number | number[]; role?: string }> }) => {
    simStoreActions.setActivePreset(payload.name, payload.width, payload.height);
    if (payload.cellProperties) {
      simStoreActions.setCellProperties(payload.cellProperties as Array<{ name: string; type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4'; default: number | number[]; role?: string }>);
    }
  };

  const onReset = () => {
    simStoreActions.resetState();
  };

  const onSpeedChange = (payload: { fps: number }) => {
    simStoreActions.setSpeed(payload.fps);
  };

  const onClear = () => {
    simStoreActions.setLiveCellCount(0);
  };

  const onComputeProgress = (payload: { computedGeneration: number }) => {
    simStoreActions.setComputedGeneration(payload.computedGeneration);
  };

  // --- viewStore wiring ---
  const onViewChange = (payload: { zoom?: number; cameraX?: number; cameraY?: number }) => {
    viewStoreActions.updateView(payload);
  };

  // --- uiStore + layoutStore wiring ---
  const onUiChange = (payload: { isTerminalOpen?: boolean; isParamPanelOpen?: boolean; isHotkeyHelpOpen?: boolean }) => {
    // Panel visibility lives in layoutStore; hotkey help stays in uiStore
    if (payload.isTerminalOpen !== undefined) {
      layoutStoreActions.setTerminalOpen(payload.isTerminalOpen);
    }
    if (payload.isParamPanelOpen !== undefined) {
      layoutStoreActions.setParamPanelOpen(payload.isParamPanelOpen);
    }
    if (payload.isHotkeyHelpOpen !== undefined) {
      uiStoreActions.updateUi({ isHotkeyHelpOpen: payload.isHotkeyHelpOpen });
    }
  };

  // --- param wiring ---
  const onParamChanged = (payload: { name: string; value: number }) => {
    simStoreActions.setParam(payload.name, payload.value);
  };

  const onParamsReset = () => {
    // Reset to defaults from current paramDefs
    const defs = simStoreActions.getParamDefs();
    const defaults: Record<string, number> = {};
    for (const d of defs) {
      defaults[d.name] = d.default;
    }
    simStoreActions.resetParams(defaults);
  };

  const onParamDefsChanged = (payload: { defs: Array<{ name: string; label?: string; type: string; default: number; min?: number; max?: number; step?: number }>; values: Record<string, number> }) => {
    simStoreActions.setParamDefs(payload.defs, payload.values);
  };

  const onTimelineExtend = (payload: { duration: number }) => {
    uiStoreActions.setTimelineDuration(payload.duration);
  };

  // Subscribe to all events
  eventBus.on('sim:tick', onTick);
  eventBus.on('sim:play', onPlay);
  eventBus.on('sim:pause', onPause);
  eventBus.on('sim:presetLoaded', onPresetLoaded);
  eventBus.on('sim:reset', onReset);
  eventBus.on('sim:speedChange', onSpeedChange);
  eventBus.on('sim:clear', onClear);
  eventBus.on('sim:computeProgress', onComputeProgress);
  eventBus.on('sim:paramChanged', onParamChanged);
  eventBus.on('sim:paramsReset', onParamsReset);
  eventBus.on('sim:paramDefsChanged', onParamDefsChanged);
  eventBus.on('sim:timelineExtend', onTimelineExtend);
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
    eventBus.off('sim:speedChange', onSpeedChange);
    eventBus.off('sim:clear', onClear);
    eventBus.off('sim:computeProgress', onComputeProgress);
    eventBus.off('sim:paramChanged', onParamChanged);
    eventBus.off('sim:paramsReset', onParamsReset);
    eventBus.off('sim:paramDefsChanged', onParamDefsChanged);
    eventBus.off('sim:timelineExtend', onTimelineExtend);
    eventBus.off('view:change', onViewChange);
    eventBus.off('ui:change', onUiChange);
  };
}
