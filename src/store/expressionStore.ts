/**
 * Operator state store. UI: "Operators"
 *
 * UI-facing mirror of ExpressionTagRegistry state. Updated via EventBus wiring.
 * Replaces the separate linkStore and the expressions field in scriptStore.
 * Store name kept as expressionStore for backward compatibility.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ExpressionTag } from '../engine/expression/types';

export interface ExpressionState {
  /** All expression tags across the system */
  tags: ExpressionTag[];
}

const initialExpressionState: ExpressionState = {
  tags: [],
};

export const useExpressionStore = create<ExpressionState>()(
  subscribeWithSelector((): ExpressionState => ({ ...initialExpressionState })),
);

export const expressionStoreActions = {
  addTag: (tag: ExpressionTag): void => {
    useExpressionStore.setState((s) => ({
      tags: [...s.tags, tag],
    }));
  },

  removeTag: (id: string): void => {
    useExpressionStore.setState((s) => ({
      tags: s.tags.filter((t) => t.id !== id),
    }));
  },

  updateTag: (id: string, patch: Partial<ExpressionTag>): void => {
    useExpressionStore.setState((s) => ({
      tags: s.tags.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    }));
  },

  setTags: (tags: ExpressionTag[]): void => {
    useExpressionStore.setState({ tags });
  },

  resetAll: (): void => {
    useExpressionStore.setState({ ...initialExpressionState });
  },
};
