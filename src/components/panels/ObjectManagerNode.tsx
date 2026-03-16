/**
 * ObjectManagerNode: recursive node renderer for the scene tree.
 *
 * Renders a single SceneNode with indent, expand/collapse, icon, name,
 * tag badges, and enabled toggle. Recurses for children.
 */

import React, { useCallback } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import type { SceneNode } from '../../engine/scene/SceneNode';
import { NODE_TYPES } from '../../engine/scene/SceneNode';

interface ObjectManagerNodeProps {
  nodeId: string;
  depth: number;
}

/** Icon map by node type */
const NODE_ICONS: Record<string, string> = {
  [NODE_TYPES.SIM_ROOT]: '\u25B6', // right-pointing triangle
  [NODE_TYPES.CELL_TYPE]: '\u25CF', // filled circle
  [NODE_TYPES.ENVIRONMENT]: '\u2699', // gear
  [NODE_TYPES.GLOBALS]: '\u03BD', // nu (variable)
  [NODE_TYPES.GROUP]: '\u25A1', // empty square
  [NODE_TYPES.INITIAL_STATE]: '\u2B50', // star
  [NODE_TYPES.SHARED]: '\u221E', // infinity
};

function getNodeIcon(type: string): string {
  return NODE_ICONS[type] ?? '\u25CB'; // empty circle fallback
}

export const ObjectManagerNode: React.FC<ObjectManagerNodeProps> = React.memo(
  ({ nodeId, depth }) => {
    const node = useSceneStore((s) => s.nodes[nodeId]);
    const selectedNodeId = useSceneStore((s) => s.selectedNodeId);
    const expandedNodeIds = useSceneStore((s) => s.expandedNodeIds);

    const isSelected = selectedNodeId === nodeId;
    const isExpanded = expandedNodeIds.includes(nodeId);
    const hasChildren = node?.childIds.length > 0;

    const handleClick = useCallback(() => {
      commandRegistry.execute('scene.select', { id: nodeId });
    }, [nodeId]);

    const handleToggleExpand = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isExpanded) {
          commandRegistry.execute('scene.collapse', { id: nodeId });
        } else {
          commandRegistry.execute('scene.expand', { id: nodeId });
        }
      },
      [nodeId, isExpanded],
    );

    const handleToggleEnabled = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node?.enabled) {
          commandRegistry.execute('scene.disable', { id: nodeId });
        } else {
          commandRegistry.execute('scene.enable', { id: nodeId });
        }
      },
      [nodeId, node?.enabled],
    );

    if (!node) return null;

    const indent = depth * 16;
    const icon = getNodeIcon(node.type);
    const colorSwatch =
      node.type === NODE_TYPES.CELL_TYPE && node.properties.color
        ? (node.properties.color as string)
        : null;

    return (
      <>
        <div
          data-testid={`om-node-${nodeId}`}
          onClick={handleClick}
          className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer text-xs font-mono
            ${isSelected ? 'bg-green-400/20 text-green-300' : 'text-zinc-300 hover:bg-zinc-700/50'}`}
          style={{ paddingLeft: `${indent + 4}px` }}
        >
          {/* Expand/collapse chevron */}
          <span
            onClick={hasChildren ? handleToggleExpand : undefined}
            className={`w-3 text-center ${hasChildren ? 'cursor-pointer text-zinc-400' : 'text-transparent'}`}
          >
            {hasChildren ? (isExpanded ? '\u25BE' : '\u25B8') : '\u00B7'}
          </span>

          {/* Type icon */}
          <span className="w-4 text-center text-zinc-500">{icon}</span>

          {/* Color swatch for cell types */}
          {colorSwatch && (
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: colorSwatch }}
            />
          )}

          {/* Name */}
          <span className={`flex-1 truncate ${!node.enabled ? 'opacity-40' : ''}`}>
            {node.name}
          </span>

          {/* Tag count badge */}
          {node.tags.length > 0 && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">
              {node.tags.length}
            </span>
          )}

          {/* Enabled toggle */}
          <span
            onClick={handleToggleEnabled}
            className={`text-[10px] cursor-pointer px-0.5 ${
              node.enabled ? 'text-green-400' : 'text-zinc-600'
            }`}
          >
            {node.enabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Children (recursive) */}
        {isExpanded &&
          node.childIds.map((childId) => (
            <ObjectManagerNode
              key={childId}
              nodeId={childId}
              depth={depth + 1}
            />
          ))}
      </>
    );
  },
);

ObjectManagerNode.displayName = 'ObjectManagerNode';
