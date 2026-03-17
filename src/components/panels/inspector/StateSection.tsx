/**
 * Inspector section for initial-state nodes.
 * Shows grid dimensions, captured timestamp, initial toggle, capture/restore buttons.
 */

'use client';

import React, { useCallback } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { commandRegistry } from '@/commands/CommandRegistry';

interface StateSectionProps {
  node: SceneNode;
}

export const StateSection: React.FC<StateSectionProps> = ({ node }) => {
  const props = node.properties;
  const isInitial = props.isInitial as boolean;
  const width = props.width as number;
  const height = props.height as number;
  const capturedAt = props.capturedAt as string | undefined;
  const propertyNames = props.propertyNames as string[] | undefined;

  const handleToggleInitial = useCallback(() => {
    if (isInitial) {
      commandRegistry.execute('state.clearInitial', { id: node.id });
    } else {
      commandRegistry.execute('state.setInitial', { id: node.id });
    }
  }, [node.id, isInitial]);

  const handleCaptureCurrent = useCallback(() => {
    // Re-capture current grid into this state node's parent
    const parentId = node.parentId;
    commandRegistry.execute('state.delete', { id: node.id }).then(() => {
      commandRegistry.execute('state.capture', {
        name: node.name,
        parentId: parentId ?? undefined,
      }).then((result) => {
        if (result.success && result.data) {
          // If this was the initial state, re-mark the new one
          if (isInitial) {
            commandRegistry.execute('state.setInitial', { id: (result.data as { id: string }).id });
          }
        }
      });
    });
  }, [node.id, node.name, node.parentId, isInitial]);

  const handleRestore = useCallback(() => {
    commandRegistry.execute('state.restore', { id: node.id });
  }, [node.id]);

  const handleDelete = useCallback(() => {
    commandRegistry.execute('state.delete', { id: node.id });
  }, [node.id]);

  const formattedDate = capturedAt
    ? new Date(capturedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : 'Unknown';

  return (
    <div className="space-y-3">
      {/* Dimensions */}
      <div>
        <div className="text-zinc-400 text-[10px] uppercase tracking-wide mb-1">Snapshot</div>
        <div className="space-y-1 text-xs font-mono text-zinc-400">
          <div className="flex justify-between">
            <span>Dimensions</span>
            <span className="text-zinc-200 tabular-nums">{width} x {height}</span>
          </div>
          <div className="flex justify-between">
            <span>Properties</span>
            <span className="text-zinc-200 tabular-nums">{propertyNames?.length ?? 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Captured</span>
            <span className="text-zinc-200">{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Initial state toggle */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-[10px] uppercase tracking-wide">Initial State</span>
        <button
          onClick={handleToggleInitial}
          className={`text-xs font-mono px-2 py-0.5 rounded border cursor-pointer transition-colors ${
            isInitial
              ? 'bg-green-900/30 border-green-700 text-green-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
          data-testid="state-toggle-initial"
        >
          {isInitial ? 'Active' : 'Set'}
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-1.5">
        <button
          onClick={handleCaptureCurrent}
          className="w-full text-xs font-mono px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors"
        >
          Capture Current
        </button>
        <button
          onClick={handleRestore}
          className="w-full text-xs font-mono px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 cursor-pointer transition-colors"
        >
          Restore
        </button>
        <button
          onClick={handleDelete}
          className="w-full text-xs font-mono px-2 py-1.5 rounded bg-zinc-800 border border-zinc-700 text-red-400 hover:bg-red-900/20 cursor-pointer transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};
