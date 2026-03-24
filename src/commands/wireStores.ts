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
import { scriptStoreActions } from '../store/scriptStore';
import { expressionStoreActions } from '../store/expressionStore';
import { sceneStoreActions } from '../store/sceneStore';
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

  const onPresetLoaded = (payload: { name: string; width: number; height: number; cellProperties?: Array<{ name: string; type: string; default: number | number[]; role?: string; isInherent?: boolean }>; cellTypes?: Array<{ id: string; name: string; color: string; properties: Array<{ name: string; type: string; default: number | number[]; role?: string; isInherent?: boolean }> }> }) => {
    simStoreActions.setActivePreset(payload.name, payload.width, payload.height);
    // Reset generation/playback state on preset load
    simStoreActions.resetState();
    simStoreActions.setActivePreset(payload.name, payload.width, payload.height);
    // Reset timeline to starting position for live mode
    const defaultSpan = 256;
    uiStoreActions.setTimelineDuration(defaultSpan);
    uiStoreActions.setTimelineZoom(0, defaultSpan);
    if (payload.cellProperties) {
      simStoreActions.setCellProperties(payload.cellProperties as Array<{ name: string; type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4'; default: number | number[]; role?: string; isInherent?: boolean }>);
    }
    if (payload.cellTypes) {
      simStoreActions.setCellTypes(payload.cellTypes as Array<{ id: string; name: string; color: string; properties: Array<{ name: string; type: 'bool' | 'int' | 'float' | 'vec2' | 'vec3' | 'vec4'; default: number | number[]; role?: string; isInherent?: boolean }> }>);
    }
  };

  const onReset = () => {
    simStoreActions.resetState();
    // Reset timeline to starting position — live mode starts fresh from frame 0
    const defaultSpan = 256;
    uiStoreActions.setTimelineDuration(defaultSpan);
    uiStoreActions.setTimelineZoom(0, defaultSpan);
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

  const onBufferStatus = (payload: {
    size: number;
    capacity: number;
    oldestFrame: number;
    newestFrame: number;
    memoryUsage: number;
    bytesPerFrame: number;
  }) => {
    simStoreActions.setBufferStatus(payload);
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
  eventBus.on('sim:bufferStatus', onBufferStatus);
  eventBus.on('view:change', onViewChange);
  eventBus.on('ui:change', onUiChange);

  // --- scriptStore wiring (Pyodide status + variables only) ---
  const onPyodideLoading = (payload: { phase: string; progress: number }) => {
    scriptStoreActions.setPyodideStatus('loading');
    scriptStoreActions.setPyodideProgress(payload.progress);
  };

  const onPyodideReady = () => {
    scriptStoreActions.setPyodideStatus('ready');
    scriptStoreActions.setPyodideProgress(1);
  };

  const onPyodideError = () => {
    scriptStoreActions.setPyodideStatus('error');
  };

  const onVariableChanged = (payload: { name: string; value: number | string }) => {
    scriptStoreActions.setVariable(payload.name, payload.value);
  };

  const onVariableDeleted = (payload: { name: string }) => {
    scriptStoreActions.deleteVariable(payload.name);
  };

  const onVariablesReset = () => {
    scriptStoreActions.resetVariables();
  };

  eventBus.on('pyodide:loading', onPyodideLoading);
  eventBus.on('pyodide:ready', onPyodideReady);
  eventBus.on('pyodide:error', onPyodideError);
  eventBus.on('script:variableChanged', onVariableChanged);
  eventBus.on('script:variableDeleted', onVariableDeleted);
  eventBus.on('script:variablesReset', onVariablesReset);

  // --- expressionStore wiring ---
  const onTagAdded = (payload: { id: string; name: string; source: string; phase: string; enabled: boolean; owner: { type: string; id?: string }; inputs: string[]; outputs: string[]; code: string; linkMeta?: { sourceAddress: string; sourceRange: [number, number]; targetRange: [number, number]; easing: string } }) => {
    expressionStoreActions.addTag(payload as import('../engine/expression/types').ExpressionTag);
  };

  const onTagRemoved = (payload: { id: string }) => {
    expressionStoreActions.removeTag(payload.id);
  };

  const onTagUpdated = (payload: { id: string; name?: string; enabled?: boolean; phase?: string; code?: string; source?: string; nodeGraph?: unknown; linkMeta?: unknown }) => {
    const { id, ...rest } = payload;
    expressionStoreActions.updateTag(id, rest as Partial<import('../engine/expression/types').ExpressionTag>);
  };

  const onTagReset = () => {
    expressionStoreActions.resetAll();
  };

  eventBus.on('tag:added', onTagAdded);
  eventBus.on('tag:removed', onTagRemoved);
  eventBus.on('tag:updated', onTagUpdated);
  eventBus.on('tag:reset', onTagReset);

  // --- sceneStore wiring ---
  const onSceneNodeAdded = (payload: { id: string; type: string; name: string; parentId: string | null }) => {
    void payload;
  };

  const onSceneSelectionChanged = (payload: { id: string | null }) => {
    sceneStoreActions.select(payload.id);
  };

  eventBus.on('scene:selectionChanged', onSceneSelectionChanged);
  eventBus.on('scene:nodeAdded', onSceneNodeAdded);

  // --- GPU wiring ---
  const onGpuInitialized = (payload: { adapter: string; device: string; maxBufferSize: number }) => {
    // Compute max grid size for 8-channel properties
    const bytesPerCell = 8 * 4; // 8 channels × 4 bytes
    const maxCells = Math.floor(payload.maxBufferSize / bytesPerCell);
    const maxSide = Math.floor(Math.sqrt(maxCells));
    simStoreActions.setGpuStatus(true, payload.adapter, maxSide);
  };
  eventBus.on('gpu:initialized', onGpuInitialized);

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
    eventBus.off('sim:bufferStatus', onBufferStatus);
    eventBus.off('view:change', onViewChange);
    eventBus.off('ui:change', onUiChange);
    eventBus.off('pyodide:loading', onPyodideLoading);
    eventBus.off('pyodide:ready', onPyodideReady);
    eventBus.off('pyodide:error', onPyodideError);
    eventBus.off('script:variableChanged', onVariableChanged);
    eventBus.off('script:variableDeleted', onVariableDeleted);
    eventBus.off('script:variablesReset', onVariablesReset);
    eventBus.off('tag:added', onTagAdded);
    eventBus.off('tag:removed', onTagRemoved);
    eventBus.off('tag:updated', onTagUpdated);
    eventBus.off('tag:reset', onTagReset);
    eventBus.off('scene:selectionChanged', onSceneSelectionChanged);
    eventBus.off('scene:nodeAdded', onSceneNodeAdded);
    eventBus.off('gpu:initialized', onGpuInitialized);
  };
}
