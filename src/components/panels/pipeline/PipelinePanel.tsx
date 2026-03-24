/**
 * PipelinePanel: shows the complete GPU tick execution order as a vertical list.
 *
 * Reads the execution order from GPURuleRunner via getController().
 * Sections: Pre-Rule Ops | Rule Stages | Post-Rule Ops | Visual Mapping.
 * Click an entry to select it and show detail in the Inspector.
 */

'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import type { PanelProps } from '@/layout/types';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';
import { getController } from '@/components/AppShell';
import { eventBus } from '@/engine/core/EventBus';
import { useSimStore } from '@/store/simStore';
import { useExpressionStore } from '@/store/expressionStore';
import { useSceneStore, sceneStoreActions } from '@/store/sceneStore';
import { uiStoreActions } from '@/store/uiStore';
import { NODE_TYPES } from '@/engine/scene/SceneNode';
import { PipelineSection } from './PipelineSection';

export const PipelinePanel: React.FC<PanelProps> = () => {
  return <PipelineContent />;
};

function PipelineContent() {
  const activePreset = useSimStore((s) => s.activePreset);
  const opCount = useExpressionStore((s) => s.tags.length);
  const sceneNodes = useSceneStore((s) => s.nodes);

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  // Also push to uiStore so Inspector can read it
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setRevision((r) => r + 1);
  }, [activePreset, opCount]);

  // GPURuleRunner initializes asynchronously AFTER the preset store update.
  useEffect(() => {
    const bump = () => setRevision((r) => r + 1);
    eventBus.on('gpu:ruleRunnerReady', bump);
    return () => { eventBus.off('gpu:ruleRunnerReady', bump); };
  }, []);

  const entries = useMemo(() => {
    const ctrl = getController();
    if (!ctrl) return [];
    const runner = ctrl.getGPURuleRunner();
    if (!runner) return [];
    return runner.getExecutionOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  // Find the visual scene node (for cross-selection when clicking visual-mapping entries)
  const visualNodeId = useMemo(() => {
    for (const node of Object.values(sceneNodes)) {
      if (node.type === NODE_TYPES.VISUAL) return node.id;
    }
    return null;
  }, [sceneNodes]);

  const preRuleOps = useMemo(() => entries.filter((e) => e.type === 'pre-rule-op'), [entries]);
  const ruleStages = useMemo(() => entries.filter((e) => e.type === 'rule-stage'), [entries]);
  const postRuleOps = useMemo(() => entries.filter((e) => e.type === 'post-rule-op'), [entries]);
  const visualMappings = useMemo(() => entries.filter((e) => e.type === 'visual-mapping'), [entries]);

  const handleSelectEntry = useCallback((entry: PipelineEntry) => {
    setSelectedEntryId(entry.id);
    uiStoreActions.selectPipelineEntry(entry.id);

    // Cross-select into scene graph where possible
    if (entry.type === 'visual-mapping' && visualNodeId) {
      sceneStoreActions.select(visualNodeId);
    } else {
      // Clear scene selection so Inspector shows pipeline entry instead
      sceneStoreActions.select(null);
    }
  }, [visualNodeId]);

  const handleToggleEnabled = useCallback((entry: PipelineEntry) => {
    const ctrl = getController();
    if (!ctrl) return;
    const runner = ctrl.getGPURuleRunner();
    if (!runner) return;

    const newEnabled = !entry.enabled;

    if (entry.type === 'rule-stage') {
      runner.setStageEnabled(entry.sourceId!, newEnabled);
    } else {
      // post-rule-op, visual-mapping, pre-rule-op all live in expressionPasses
      runner.setPassEnabled(entry.sourceId!, newEnabled);
    }

    // Re-derive so the UI updates
    setRevision((r) => r + 1);
  }, []);

  if (!activePreset) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <span className="text-zinc-500 text-[11px] text-center">
          Load a preset to see the pipeline
        </span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <span className="text-zinc-500 text-[11px] text-center">
          No pipeline entries
        </span>
      </div>
    );
  }

  const totalDispatches = entries.reduce((n, e) => e.enabled ? n + (e.iterations ?? 1) : n, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-700/50 shrink-0">
        <span className="text-[10px] font-mono text-zinc-500">
          {entries.length} steps
        </span>
        <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
          {totalDispatches} dispatch{totalDispatches !== 1 ? 'es' : ''}/tick
        </span>
      </div>

      {/* Sections with flow connectors */}
      <div className="flex-1 overflow-y-auto py-1 pl-1">
        <PipelineSection
          title="Pre-Rule Ops"
          entries={preRuleOps}
          executionContext="cpu"
          selectedId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isLastSection={ruleStages.length === 0 && postRuleOps.length === 0 && visualMappings.length === 0}
        />
        <PipelineSection
          title="Rule Stages"
          entries={ruleStages}
          executionContext="gpu"
          selectedId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isLastSection={postRuleOps.length === 0 && visualMappings.length === 0}
        />
        <PipelineSection
          title="Post-Rule Ops"
          entries={postRuleOps}
          executionContext="gpu"
          selectedId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isLastSection={visualMappings.length === 0}
        />
        <PipelineSection
          title="Visual Mapping"
          entries={visualMappings}
          executionContext="gpu"
          selectedId={selectedEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isLastSection
        />
      </div>
    </div>
  );
}
