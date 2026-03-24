/**
 * ObjectManagerNode: recursive node renderer for the scene tree.
 *
 * Renders a single SceneNode with indent, expand/collapse, icon, name,
 * tag badges, and enabled toggle. Recurses for children, then renders
 * attached ops (from the node's tags array) as indented rows.
 */

import React, { useCallback } from 'react';
import { useSceneStore, sceneStoreActions } from '../../store/sceneStore';
import { useExpressionStore } from '../../store/expressionStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import { useUiStore, uiStoreActions } from '../../store/uiStore';
import type { SceneNode } from '../../engine/scene/SceneNode';
import { NODE_TYPES } from '../../engine/scene/SceneNode';
import type { Operator } from '../../engine/expression/types';

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
  [NODE_TYPES.VISUAL]: '\u25D0', // half circle
};

function getNodeIcon(type: string): string {
  return NODE_ICONS[type] ?? '\u25CB'; // empty circle fallback
}

// OP type badge styles (matches Pipeline View)
const OP_TYPE_STYLES: Record<string, { label: string; class: string }> = {
  code: { label: '\u0192', class: 'text-green-400 bg-green-400/10' },
  link: { label: '\u0192', class: 'text-green-400 bg-green-400/10' },
  script: { label: '\u26A1', class: 'text-amber-400 bg-amber-400/10' },
};

// ---------------------------------------------------------------------------
// Op row (rendered under parent node in the tree)
// ---------------------------------------------------------------------------

function OpTreeRow({ op, depth }: { op: Operator; depth: number }) {
  const selectedPipelineId = useUiStore((s) => s.selectedPipelineEntryId);
  // Both Tree and Pipeline now use the op's expression store ID as selection key
  const isSelected = selectedPipelineId === op.id;

  const indent = depth * 16;
  const badge = OP_TYPE_STYLES[op.source] ?? OP_TYPE_STYLES.code;

  const handleClick = useCallback(() => {
    // Use the op's expression store ID — Inspector will look it up directly
    uiStoreActions.selectPipelineEntry(op.id);
    // Clear scene selection so Inspector routes to pipeline entry detail
    sceneStoreActions.select(null);
  }, [op.id]);

  const handleToggleEnabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      commandRegistry.execute(op.enabled ? 'op.disable' : 'op.enable', { id: op.id });
    },
    [op.id, op.enabled],
  );

  // Match Pipeline View badge colors: pre=gray, rule=blue, post=green, visual=purple
  const phaseBadge = op.phase === 'pre-rule'
    ? { label: 'pre', class: 'bg-zinc-700 text-zinc-400' }
    : op.phase === 'rule'
      ? { label: 'rule', class: 'bg-blue-500/15 text-blue-400' }
      : { label: 'post', class: 'bg-green-500/15 text-green-400' };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer text-xs font-mono border-l-2 border-green-500/20
        ${isSelected ? 'bg-green-400/20 text-green-300' : 'text-zinc-400 hover:bg-zinc-700/50'}`}
      style={{ paddingLeft: `${indent + 4}px` }}
      data-testid={`om-op-${op.id}`}
    >
      {/* No chevron — ops don't have children */}
      <span className="w-3 text-center text-transparent">{'\u00B7'}</span>

      {/* Source badge */}
      <span className={`text-[9px] px-0.5 rounded shrink-0 leading-tight ${badge.class}`}>
        {badge.label}
      </span>

      {/* Name — strip preset prefix ("Fire – ") and " Rule" suffix for cleaner display */}
      <span className={`flex-1 truncate ${!op.enabled ? 'opacity-40' : ''}`}>
        {op.name.replace(/^.*? – /, '').replace(/ Rule$/, '')}
      </span>

      {/* Phase badge — matches Pipeline View colors */}
      <span className={`text-[9px] px-1 rounded shrink-0 leading-tight ${phaseBadge.class}`}>
        {phaseBadge.label}
      </span>

      {/* Enabled toggle */}
      <span
        onClick={handleToggleEnabled}
        className={`text-[10px] cursor-pointer px-0.5 ${
          op.enabled ? 'text-green-400' : 'text-zinc-600'
        }`}
      >
        {op.enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main node component
// ---------------------------------------------------------------------------

export const ObjectManagerNode: React.FC<ObjectManagerNodeProps> = React.memo(
  ({ nodeId, depth }) => {
    const node = useSceneStore((s) => s.nodes[nodeId]);
    const selectedNodeId = useSceneStore((s) => s.selectedNodeId);
    const expandedNodeIds = useSceneStore((s) => s.expandedNodeIds);
    const allOps = useExpressionStore((s) => s.tags);

    const isSelected = selectedNodeId === nodeId;
    const isExpanded = expandedNodeIds.includes(nodeId);
    const hasChildren = node?.childIds.length > 0;
    // Ops attached to this node
    const nodeOps = node ? allOps.filter((op) => node.tags.includes(op.id)) : [];
    const hasExpandableContent = hasChildren || nodeOps.length > 0;

    const handleClick = useCallback(() => {
      // Clear pipeline selection when selecting a tree node
      uiStoreActions.selectPipelineEntry(null);
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
            onClick={hasExpandableContent ? handleToggleExpand : undefined}
            className={`w-3 text-center ${hasExpandableContent ? 'cursor-pointer text-zinc-400' : 'text-transparent'}`}
          >
            {hasExpandableContent ? (isExpanded ? '\u25BE' : '\u25B8') : '\u00B7'}
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

          {/* Pipeline type badge for visual nodes */}
          {node.type === NODE_TYPES.VISUAL && (
            <span className="text-[9px] px-1 rounded shrink-0 leading-tight bg-purple-500/15 text-purple-400">
              visual
            </span>
          )}

          {/* Op count badge */}
          {nodeOps.length > 0 && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">
              {nodeOps.length}
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

        {/* Children (recursive) — structural hierarchy first */}
        {isExpanded &&
          node.childIds.map((childId) => (
            <ObjectManagerNode
              key={childId}
              nodeId={childId}
              depth={depth + 1}
            />
          ))}

        {/* Ops attached to this node — computation rows, indented like children */}
        {isExpanded &&
          nodeOps.map((op) => (
            <OpTreeRow key={op.id} op={op} depth={depth + 1} />
          ))}
      </>
    );
  },
);

ObjectManagerNode.displayName = 'ObjectManagerNode';
