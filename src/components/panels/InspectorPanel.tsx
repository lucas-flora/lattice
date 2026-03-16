/**
 * InspectorPanel: context-sensitive property panel for the selected scene node.
 *
 * Shows different content based on the selected node's type:
 * - sim-root: grid config, preset info
 * - cell-type: color, property list, tags
 * - environment: parameter sliders
 * - globals: variable editor
 * - group: name, shared properties
 * - nothing: placeholder
 *
 * Supports floating and docked modes (like ScriptPanel / ParamPanel).
 * Toggle with key 4, dock with Ctrl+4.
 */

import React, { useCallback } from 'react';
import type { PanelProps } from '../../layout/types';
import { useSceneStore } from '../../store/sceneStore';
import { useExpressionStore } from '../../store/expressionStore';
import { useLayoutStore, layoutStoreActions } from '../../store/layoutStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import { ResizeHandle } from '../ui/ResizeHandle';
import { NODE_TYPES } from '../../engine/scene/SceneNode';
import { SimRootSection } from './inspector/SimRootSection';
import { CellTypeSection } from './inspector/CellTypeSection';
import { EnvironmentSection } from './inspector/EnvironmentSection';
import { GlobalsSection } from './inspector/GlobalsSection';
import { TagRow } from './TagRow';

/** Type icon map */
const TYPE_LABELS: Record<string, string> = {
  [NODE_TYPES.SIM_ROOT]: 'Simulation Root',
  [NODE_TYPES.CELL_TYPE]: 'Cell Type',
  [NODE_TYPES.ENVIRONMENT]: 'Environment',
  [NODE_TYPES.GLOBALS]: 'Globals',
  [NODE_TYPES.GROUP]: 'Group',
  [NODE_TYPES.INITIAL_STATE]: 'Initial State',
  [NODE_TYPES.SHARED]: 'Shared',
};

/** Inner content — used by both the registered panel and the shell wrapper */
export const InspectorPanel: React.FC<PanelProps> = () => {
  return <InspectorContent />;
};

function InspectorContent() {
  const selectedNodeId = useSceneStore((s) => s.selectedNodeId);
  const node = useSceneStore((s) =>
    s.selectedNodeId ? s.nodes[s.selectedNodeId] : null,
  );
  const tags = useExpressionStore((s) => s.tags);

  if (!node) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <span className="text-zinc-500 text-[11px] text-center">
          Select an object in the Object Manager (1)
        </span>
      </div>
    );
  }

  const typeLabel = TYPE_LABELS[node.type] ?? node.type;
  const nodeTags = tags.filter((t) => node.tags.includes(t.id));

  return (
    <>
      {/* Node header */}
      <div className="px-3 py-2 border-b border-zinc-700/50">
        <div className="flex items-center justify-between">
          <span className="text-green-400 text-[12px] font-mono">{node.name}</span>
          <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-500 font-mono">
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {/* Type-specific section */}
        {node.type === NODE_TYPES.SIM_ROOT && <SimRootSection node={node} />}
        {node.type === NODE_TYPES.CELL_TYPE && <CellTypeSection node={node} />}
        {node.type === NODE_TYPES.ENVIRONMENT && <EnvironmentSection node={node} />}
        {node.type === NODE_TYPES.GLOBALS && <GlobalsSection node={node} />}
        {node.type === NODE_TYPES.GROUP && (
          <div className="text-zinc-500 text-[11px]">
            Organizational container. {node.childIds.length} children.
          </div>
        )}

        {/* Tags section (all node types) — uses real TagRow for edit/toggle */}
        {nodeTags.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-zinc-400 text-[10px] uppercase tracking-wide font-mono">
              Tags ({nodeTags.length})
            </div>
            {nodeTags.map((tag) => (
              <TagRow key={tag.id} tag={tag} />
            ))}
          </div>
        )}

        {/* ID (debug) */}
        <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800 font-mono">
          {selectedNodeId}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shell wrapper with docked/floating support
// ---------------------------------------------------------------------------

interface InspectorShellProps {
  docked?: boolean;
}

export function InspectorShell({ docked = false }: InspectorShellProps) {
  const isOpen = useLayoutStore((s) => s.isInspectorOpen);
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);

  const handleClose = useCallback(() => {
    commandRegistry.execute('ui.toggleInspector', {});
  }, []);

  const handleResize = useCallback(
    (delta: number) => {
      layoutStoreActions.setInspectorWidth(inspectorWidth - delta);
    },
    [inspectorWidth],
  );

  const panelContent = (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-300 overflow-hidden border-l border-zinc-700/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
          Inspector
        </span>
        <button
          onClick={handleClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
          title="Close"
        >
          &times;
        </button>
      </div>
      <InspectorContent />
    </div>
  );

  if (docked) {
    return (
      <div className="relative shrink-0 h-full" style={{ width: inspectorWidth }} data-testid="inspector-panel">
        <div className="absolute inset-0 overflow-hidden">
          {panelContent}
        </div>
        <div className="absolute left-1 top-0 bottom-0 z-10 flex">
          <ResizeHandle direction="horizontal" onResize={handleResize} onDoubleClick={handleClose} />
        </div>
      </div>
    );
  }

  // Floating mode
  return (
    <div
      className={`absolute top-0 right-0 bottom-0 z-15 transition-all duration-200 ease-out pointer-events-auto ${isOpen ? '' : 'pointer-events-none'}`}
      style={{
        width: inspectorWidth,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      }}
      data-testid="inspector-panel"
    >
      <div className="absolute inset-0 overflow-hidden">
        {panelContent}
      </div>
      <div className="absolute left-1 top-0 bottom-0 z-10 flex">
        <ResizeHandle direction="horizontal" onResize={handleResize} onDoubleClick={handleClose} />
      </div>
    </div>
  );
}
