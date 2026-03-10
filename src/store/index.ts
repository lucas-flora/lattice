/**
 * Zustand stores module.
 *
 * All stores use subscribeWithSelector middleware for engine-to-store
 * event subscription without causing React re-renders.
 *
 * Stores are read-only mirrors of engine state — engine is source of truth.
 */

export { useSimStore } from './simStore';
export type { SimState } from './simStore';

export { useViewStore } from './viewStore';
export type { ViewState } from './viewStore';

export { useUiStore } from './uiStore';
export type { UiState } from './uiStore';

export { useAiStore } from './aiStore';
export type { AiState, ChatMessage } from './aiStore';
