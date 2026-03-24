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

  /** Reorder a tag within its phase group (same-phase siblings only). */
  reorderTag: (id: string, newIndex: number): void => {
    useExpressionStore.setState((s) => {
      const tag = s.tags.find((t) => t.id === id);
      if (!tag) return s;
      const phase = tag.phase;
      // Collect indices of tags in the same phase
      const phaseIndices: number[] = [];
      for (let i = 0; i < s.tags.length; i++) {
        if (s.tags[i].phase === phase) phaseIndices.push(i);
      }
      const curLocal = phaseIndices.findIndex((gi) => s.tags[gi].id === id);
      if (curLocal < 0 || newIndex < 0 || newIndex >= phaseIndices.length || curLocal === newIndex) return s;
      // Build new array
      const next = [...s.tags];
      const globalIdx = phaseIndices[curLocal];
      const [moved] = next.splice(globalIdx, 1);
      // Recompute phase indices after removal
      const updated: number[] = [];
      for (let i = 0; i < next.length; i++) {
        if (next[i].phase === phase) updated.push(i);
      }
      const insertAt = newIndex < updated.length
        ? updated[newIndex]
        : (updated.length > 0 ? updated[updated.length - 1] + 1 : next.length);
      next.splice(insertAt, 0, moved);
      return { tags: next };
    });
  },

  resetAll: (): void => {
    useExpressionStore.setState({ ...initialExpressionState });
  },
};
