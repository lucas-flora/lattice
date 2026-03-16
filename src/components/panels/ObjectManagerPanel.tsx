/**
 * ObjectManagerPanel: tree view of all scene nodes.
 *
 * Registered as panel type 'objectManager'. Shows the full scene hierarchy
 * with expand/collapse, selection, and node type icons.
 */

import React, { useCallback, useEffect } from 'react';
import type { PanelProps } from '../../layout/types';
import { useSceneStore } from '../../store/sceneStore';
import { useSimStore } from '../../store/simStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import { ObjectManagerNode } from './ObjectManagerNode';

export const ObjectManagerPanel: React.FC<PanelProps> = () => {
  const rootIds = useSceneStore((s) => s.rootIds);
  const nodeCount = useSceneStore((s) => Object.keys(s.nodes).length);
  const activePreset = useSimStore((s) => s.activePreset);

  // Auto-build tree when preset loads and tree is empty
  useEffect(() => {
    if (activePreset && nodeCount === 0) {
      commandRegistry.execute('scene.buildTree', {});
    }
  }, [activePreset, nodeCount]);

  const handleAddRoot = useCallback(() => {
    commandRegistry.execute('scene.add', {
      type: 'sim-root',
      name: 'New Simulation',
    });
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-300 font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700/50">
        <span className="text-zinc-400 text-[11px] font-semibold uppercase tracking-wide">
          Object Manager
        </span>
        <span className="text-zinc-600 text-[10px]">{nodeCount} nodes</span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {rootIds.length === 0 ? (
          <div className="px-3 py-4 text-zinc-500 text-center text-[11px]">
            No scene loaded. Load a preset or add a root.
          </div>
        ) : (
          rootIds.map((rootId) => (
            <ObjectManagerNode key={rootId} nodeId={rootId} depth={0} />
          ))
        )}
      </div>

      {/* Footer: Add Root button */}
      <div className="px-2 py-1 border-t border-zinc-700/50">
        <button
          onClick={handleAddRoot}
          className="w-full text-center text-[11px] text-zinc-500 hover:text-green-400
                     py-0.5 rounded hover:bg-zinc-800 transition-colors"
        >
          + Add Root
        </button>
      </div>
    </div>
  );
};
