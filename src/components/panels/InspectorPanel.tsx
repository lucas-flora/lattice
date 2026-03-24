/**
 * InspectorPanel: context-sensitive property panel for the selected scene node
 * or pipeline entry.
 *
 * Routes based on:
 * 1. Selected scene node (from sceneStore.selectedNodeId)
 * 2. Selected pipeline entry (from uiStore.selectedPipelineEntryId) — for rule
 *    stages and ops that don't have scene nodes
 * 3. Nothing selected — empty state
 */

import React, { useCallback, useMemo } from 'react';
import type { PanelProps } from '../../layout/types';
import { useSceneStore } from '../../store/sceneStore';
import { useExpressionStore } from '../../store/expressionStore';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore, layoutStoreActions } from '../../store/layoutStore';
import { commandRegistry } from '../../commands/CommandRegistry';
import { ResizeHandle } from '../ui/ResizeHandle';
import { NODE_TYPES } from '../../engine/scene/SceneNode';
import type { SceneNode } from '../../engine/scene/SceneNode';
import { InspectorHeader } from './inspector/InspectorHeader';
import { SimRootSection } from './inspector/SimRootSection';
import { CellTypeSection } from './inspector/CellTypeSection';
import { EnvironmentSection } from './inspector/EnvironmentSection';
import { GlobalsSection } from './inspector/GlobalsSection';
import { StateSection } from './inspector/StateSection';
import { VisualSection } from './inspector/VisualSection';
import { LogicInspectorTabs } from './inspector/LogicInspectorTabs';
import { RuleStageSection } from './inspector/RuleStageSection';
import { OperatorSection } from './inspector/OperatorSection';
import { OpRow } from './OpRow';
import { getController } from '../AppShell';

/** Extract code from a visual node's properties for the Code tab */
function getVisualCode(node: SceneNode): string | undefined {
  const mappings = node.properties.visual_mappings as Array<{ type?: string; code?: string }> | undefined;
  if (!mappings) return undefined;
  const scriptMapping = mappings.find((m) => m.type === 'script' && m.code);
  return scriptMapping?.code;
}

function getVisualCodeLang(node: SceneNode): string {
  const mappings = node.properties.visual_mappings as Array<{ type?: string }> | undefined;
  if (!mappings) return 'Config';
  const hasScript = mappings.some((m) => m.type === 'script');
  return hasScript ? 'Python (transpiled to WGSL)' : 'Ramp Config';
}

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
  const selectedPipelineEntryId = useUiStore((s) => s.selectedPipelineEntryId);

  // If a scene node is selected, show that. Otherwise check pipeline entry.
  if (node) {
    return <SceneNodeDetail node={node} nodeId={selectedNodeId!} tags={tags} />;
  }

  if (selectedPipelineEntryId) {
    return <PipelineEntryDetail entryId={selectedPipelineEntryId} tags={tags} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <span className="text-zinc-500 text-[11px] text-center">
        Select an object to inspect
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scene node detail (existing routing, now with InspectorHeader)
// ---------------------------------------------------------------------------

function SceneNodeDetail({ node, nodeId, tags }: { node: SceneNode; nodeId: string; tags: import('../../engine/expression/types').Operator[] }) {
  const nodeTags = tags.filter((t) => node.tags.includes(t.id));

  const handleDelete = useCallback(() => {
    commandRegistry.execute('scene.remove', { id: nodeId });
  }, [nodeId]);

  const handleEnabledChange = useCallback((enabled: boolean) => {
    commandRegistry.execute(enabled ? 'scene.enable' : 'scene.disable', { id: nodeId });
  }, [nodeId]);

  // Determine header props based on node type
  const isLogicNode = node.type === NODE_TYPES.VISUAL;
  const typeLabel = {
    [NODE_TYPES.SIM_ROOT]: 'Sim Root',
    [NODE_TYPES.CELL_TYPE]: 'Cell Type',
    [NODE_TYPES.ENVIRONMENT]: 'Environment',
    [NODE_TYPES.GLOBALS]: 'Globals',
    [NODE_TYPES.GROUP]: 'Group',
    [NODE_TYPES.INITIAL_STATE]: 'Initial State',
    [NODE_TYPES.VISUAL]: 'Visual Mapping',
  }[node.type] ?? node.type;

  const typeColor = {
    [NODE_TYPES.VISUAL]: 'bg-purple-500/15 text-purple-400',
  }[node.type] ?? 'bg-zinc-800 text-zinc-500';

  const canDelete = node.type !== NODE_TYPES.SIM_ROOT
    && node.type !== NODE_TYPES.ENVIRONMENT
    && node.type !== NODE_TYPES.GLOBALS;

  return (
    <>
      <InspectorHeader
        nodeId={nodeId}
        name={node.name}
        typeLabel={typeLabel}
        typeColor={typeColor}
        editable={node.type !== NODE_TYPES.SIM_ROOT}
        showEnabled={isLogicNode}
        enabled={node.enabled}
        onEnabledChange={handleEnabledChange}
        showDelete={canDelete}
        onDelete={handleDelete}
      />

      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-2">
        {node.type === NODE_TYPES.SIM_ROOT && <SimRootSection node={node} />}
        {node.type === NODE_TYPES.CELL_TYPE && <CellTypeSection node={node} />}
        {node.type === NODE_TYPES.ENVIRONMENT && <EnvironmentSection node={node} />}
        {node.type === NODE_TYPES.GLOBALS && <GlobalsSection node={node} />}
        {node.type === NODE_TYPES.INITIAL_STATE && <StateSection node={node} />}
        {node.type === NODE_TYPES.VISUAL && (
          <LogicInspectorTabs
            node={node}
            summaryContent={<VisualSection node={node} />}
            code={getVisualCode(node)}
            codeLang={getVisualCodeLang(node)}
            noCodeMessage="No source code — this mapping uses a ramp/discrete configuration. See the Summary tab."
          />
        )}
        {node.type === NODE_TYPES.GROUP && (
          <div className="text-zinc-500 text-[11px]">
            Organizational container. {node.childIds.length} children.
          </div>
        )}

        {/* Attached ops */}
        {nodeTags.length > 0 && (
          <div className="space-y-1">
            <div className="text-zinc-400 text-[9px] uppercase tracking-wide font-mono">
              Ops ({nodeTags.length})
            </div>
            {nodeTags.map((tag) => (
              <OpRow key={tag.id} op={tag} />
            ))}
          </div>
        )}

        {/* Debug ID */}
        <div className="text-[9px] text-zinc-600 pt-1 border-t border-zinc-800 font-mono">
          {nodeId}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pipeline entry detail (for rule stages and ops selected from Pipeline View)
// ---------------------------------------------------------------------------

function PipelineEntryDetail({ entryId, tags }: { entryId: string; tags: import('../../engine/expression/types').Operator[] }) {
  // Look up the pipeline entry
  const ctrl = getController();
  const runner = ctrl?.getGPURuleRunner();
  const entries = useMemo(() => runner?.getExecutionOrder() ?? [], [runner]);
  const entry = entries.find((e) => e.id === entryId);

  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <span className="text-zinc-500 text-[11px] text-center">
          Pipeline entry not found
        </span>
      </div>
    );
  }

  // Rule stages get their own section
  if (entry.type === 'rule-stage') {
    return <RuleStageSection entry={entry} />;
  }

  // Operators: find the matching op from the expression store
  if (entry.type === 'post-rule-op' || entry.type === 'pre-rule-op') {
    const op = tags.find((t) => t.name === entry.sourceId);
    if (op) {
      return <OperatorSection op={op} />;
    }
  }

  // Visual mapping entries — these should have selected the visual scene node instead
  // but handle gracefully
  return (
    <div className="px-2 py-1.5">
      <InspectorHeader
        nodeId={entry.id}
        name={entry.name}
        typeLabel={entry.type.replace(/-/g, ' ')}
        editable={false}
      />
      <div className="text-[11px] text-zinc-500 mt-2">
        Select this entry in the Tree tab to see full details.
      </div>
    </div>
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
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-zinc-700/50 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
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
