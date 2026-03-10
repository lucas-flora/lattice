/**
 * Zustand stores module.
 *
 * All stores use subscribeWithSelector middleware for engine-to-store
 * event subscription without causing React re-renders.
 *
 * Stores are read-only mirrors of engine state -- engine is source of truth.
 */

export { useSimStore, simStoreActions } from './simStore';
export type { SimState } from './simStore';

export { useViewStore, viewStoreActions } from './viewStore';
export type { ViewState } from './viewStore';

export { useUiStore, uiStoreActions } from './uiStore';
export type { UiState } from './uiStore';

export { useAiStore, aiStoreActions } from './aiStore';
export type { AiState, ChatMessage } from './aiStore';
