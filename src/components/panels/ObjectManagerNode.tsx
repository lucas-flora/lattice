/**
 * ObjectManagerNode: recursive node renderer for the scene tree.
 *
 * Renders a single SceneNode with indent, expand/collapse, icon, name,
 * tag badges, and enabled toggle. Recurses for children, then renders
 * attached ops (from the node's tags array) as indented rows.
 *
 * Right-click opens a context menu with Rename, Duplicate, Delete, etc.
 */

import React, { useCallback, useState } from 'react';
import { useSceneStore, sceneStoreActions } from '../../store/sceneStore';
import { useExpressionStore } from '../../store/expressionStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import { useUiStore, uiStoreActions } from '../../store/uiStore';
import type { SceneNode } from '../../engine/scene/SceneNode';
import { NODE_TYPES } from '../../engine/scene/SceneNode';
import type { Operator } from '../../engine/expression/types';
import { ContextMenu, type ContextMenuItem } from '../shared/ContextMenu';

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

const NON_DUPLICATABLE: Set<string> = new Set([NODE_TYPES.SIM_ROOT, NODE_TYPES.ENVIRONMENT, NODE_TYPES.GLOBALS]);
const NON_DELETABLE: Set<string> = new Set([NODE_TYPES.SIM_ROOT, NODE_TYPES.ENVIRONMENT, NODE_TYPES.GLOBALS]);

// ---------------------------------------------------------------------------
// Op row (rendered under parent node in the tree)
// ---------------------------------------------------------------------------

function OpTreeRow({ op, depth, parentNodeId }: { op: Operator; depth: number; parentNodeId: string }) {
  const focusedOpId = useUiStore((s) => s.focusedOpId);
  const isSelected = focusedOpId === op.id;
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const indent = depth * 16;
  const badge = OP_TYPE_STYLES[op.source] ?? OP_TYPE_STYLES.code;

  const handleClick = useCallback(() => {
    commandRegistry.execute('scene.select', { id: parentNodeId });
    uiStoreActions.focusOp(op.id);
  }, [op.id, parentNodeId]);

  const handleToggleEnabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      commandRegistry.execute(op.enabled ? 'op.disable' : 'op.enable', { id: op.id });
    },
    [op.id, op.enabled],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const phaseBadge = op.phase === 'pre-rule'
    ? { label: 'pre', class: 'bg-zinc-700 text-zinc-400' }
    : op.phase === 'rule'
      ? { label: 'rule', class: 'bg-blue-500/15 text-blue-400' }
      : { label: 'post', class: 'bg-green-500/15 text-green-400' };

  const ctxItems: ContextMenuItem[] = [
    {
      label: 'Duplicate',
      action: () => commandRegistry.execute('op.copy', { id: op.id, ownerType: op.owner.type, ownerId: op.owner.id }),
    },
    {
      label: op.enabled ? 'Disable' : 'Enable',
      action: () => commandRegistry.execute(op.enabled ? 'op.disable' : 'op.enable', { id: op.id }),
    },
    {
      label: 'Delete',
      divider: true,
      action: () => commandRegistry.execute('op.remove', { id: op.id }),
    },
  ];

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer text-xs font-mono border-l-2 border-green-500/20
          ${isSelected ? 'bg-green-400/20 text-green-300' : 'text-zinc-400 hover:bg-zinc-700/50'}`}
        style={{ paddingLeft: `${indent + 4}px` }}
        data-testid={`om-op-${op.id}`}
      >
        <span className="w-3 text-center text-transparent">{'\u00B7'}</span>
        <span className={`text-[9px] px-0.5 rounded shrink-0 leading-tight ${badge.class}`}>{badge.label}</span>
        <span className={`flex-1 truncate ${!op.enabled ? 'opacity-40' : ''}`}>
          {op.name.replace(/^.*? – /, '').replace(/ Rule$/, '')}
        </span>
        <span className={`text-[9px] px-1 rounded shrink-0 leading-tight ${phaseBadge.class}`}>{phaseBadge.label}</span>
        <span
          onClick={handleToggleEnabled}
          className={`text-[10px] cursor-pointer px-0.5 ${op.enabled ? 'text-green-400' : 'text-zinc-600'}`}
        >
          {op.enabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
      )}
    </>
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

    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    const isSelected = selectedNodeId === nodeId;
    const isExpanded = expandedNodeIds.includes(nodeId);
    const hasChildren = node?.childIds.length > 0;
    const nodeOps = node ? allOps.filter((op) => node.tags.includes(op.id)) : [];
    const hasExpandableContent = hasChildren || nodeOps.length > 0;

    const handleClick = useCallback(() => {
      uiStoreActions.focusOp(null);
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

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    }, []);

    if (!node) return null;

    const indent = depth * 16;
    const icon = getNodeIcon(node.type);
    const colorSwatch =
      node.type === NODE_TYPES.CELL_TYPE && node.properties.color
        ? (node.properties.color as string)
        : null;

    const canDuplicate = !NON_DUPLICATABLE.has(node.type as string);
    const canDelete = !NON_DELETABLE.has(node.type as string);

    const ctxItems: ContextMenuItem[] = [
      {
        label: 'Duplicate',
        action: () => commandRegistry.execute('scene.duplicate', { id: nodeId }),
        hidden: !canDuplicate,
      },
      {
        label: 'Duplicate with Children',
        action: () => commandRegistry.execute('scene.duplicate', { id: nodeId, deep: true }),
        hidden: !canDuplicate || !hasChildren,
      },
      {
        label: node.enabled ? 'Disable' : 'Enable',
        divider: true,
        action: () => commandRegistry.execute(node.enabled ? 'scene.disable' : 'scene.enable', { id: nodeId }),
      },
      {
        label: 'Delete',
        divider: true,
        action: () => commandRegistry.execute('scene.remove', { id: nodeId }),
        hidden: !canDelete,
      },
    ];

    return (
      <>
        <div
          data-testid={`om-node-${nodeId}`}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          className={`flex items-center gap-1 px-1 py-0.5 cursor-pointer text-xs font-mono
            ${isSelected ? 'bg-green-400/20 text-green-300' : 'text-zinc-300 hover:bg-zinc-700/50'}`}
          style={{ paddingLeft: `${indent + 4}px` }}
        >
          <span
            onClick={hasExpandableContent ? handleToggleExpand : undefined}
            className={`w-3 text-center ${hasExpandableContent ? 'cursor-pointer text-zinc-400' : 'text-transparent'}`}
          >
            {hasExpandableContent ? (isExpanded ? '\u25BE' : '\u25B8') : '\u00B7'}
          </span>
          <span className="w-4 text-center text-zinc-500">{icon}</span>
          {colorSwatch && (
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colorSwatch }} />
          )}
          <span className={`flex-1 truncate ${!node.enabled ? 'opacity-40' : ''}`}>{node.name}</span>
          {node.type === NODE_TYPES.VISUAL && (
            <span className="text-[9px] px-1 rounded shrink-0 leading-tight bg-purple-500/15 text-purple-400">visual</span>
          )}
          {nodeOps.length > 0 && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">{nodeOps.length}</span>
          )}
          <span
            onClick={handleToggleEnabled}
            className={`text-[10px] cursor-pointer px-0.5 ${node.enabled ? 'text-green-400' : 'text-zinc-600'}`}
          >
            {node.enabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {isExpanded &&
          node.childIds.map((childId) => (
            <ObjectManagerNode key={childId} nodeId={childId} depth={depth + 1} />
          ))}

        {isExpanded &&
          nodeOps.map((op) => (
            <OpTreeRow key={op.id} op={op} depth={depth + 1} parentNodeId={nodeId} />
          ))}

        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
        )}
      </>
    );
  },
);

ObjectManagerNode.displayName = 'ObjectManagerNode';
