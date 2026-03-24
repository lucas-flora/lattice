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
import { useUiStore, uiStoreActions } from '@/store/uiStore';
import { NODE_TYPES } from '@/engine/scene/SceneNode';
import { PipelineSection } from './PipelineSection';

export const PipelinePanel: React.FC<PanelProps> = () => {
  return <PipelineContent />;
};

function PipelineContent() {
  const activePreset = useSimStore((s) => s.activePreset);
  const ops = useExpressionStore((s) => s.tags);
  const sceneNodes = useSceneStore((s) => s.nodes);
  const focusedOpId = useUiStore((s) => s.focusedOpId);
  const selectedPipelineEntryId = useUiStore((s) => s.selectedPipelineEntryId);

  const [revision, setRevision] = useState(0);

  useEffect(() => {
    setRevision((r) => r + 1);
  }, [activePreset, ops.length]);

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
    const raw = runner.getExecutionOrder();
    // Enrich entries with expression store op IDs for cross-selection
    for (const entry of raw) {
      if (entry.type === 'rule-stage') {
        const match = ops.find((o) => o.phase === 'rule' && o.name.includes(entry.sourceId!));
        if (match) entry.opId = match.id;
      } else if (entry.type === 'post-rule-op' || entry.type === 'pre-rule-op') {
        const match = ops.find((o) => o.name === entry.sourceId || o.name.includes(entry.sourceId!));
        if (match) entry.opId = match.id;
      }
    }
    return raw;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, ops]);

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
    if (entry.type === 'visual-mapping' && visualNodeId) {
      // Visual mapping is a scene node — select it like any other node
      uiStoreActions.focusOp(null);
      uiStoreActions.selectPipelineEntry(null);
      sceneStoreActions.select(visualNodeId);
    } else if (entry.opId) {
      // Op with expression store ID — select parent scene node + focus op
      const parentNode = Object.values(sceneNodes).find((n) => n.tags.includes(entry.opId!));
      if (parentNode) {
        sceneStoreActions.select(parentNode.id);
      }
      uiStoreActions.focusOp(entry.opId);
      uiStoreActions.selectPipelineEntry(null);
    } else {
      // Rule stages without opId — pipeline entry fallback
      sceneStoreActions.select(null);
      uiStoreActions.focusOp(null);
      uiStoreActions.selectPipelineEntry(entry.id);
    }
  }, [visualNodeId, sceneNodes]);

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

      {/* Sections with nested flow connectors */}
      <div className="flex-1 overflow-y-auto py-1 pl-1">
        <PipelineSection
          title="Pre-Rule Ops"
          entries={preRuleOps}
          executionContext="cpu"
          selectedId={focusedOpId ?? selectedPipelineEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isFirstSection
          isLastSection={ruleStages.length === 0 && postRuleOps.length === 0 && visualMappings.length === 0}
        />
        <PipelineSection
          title="Rule Stages"
          entries={ruleStages}
          executionContext="gpu"
          selectedId={focusedOpId ?? selectedPipelineEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isFirstSection={preRuleOps.length === 0}
          isLastSection={postRuleOps.length === 0 && visualMappings.length === 0}
        />
        <PipelineSection
          title="Post-Rule Ops"
          entries={postRuleOps}
          executionContext="gpu"
          selectedId={focusedOpId ?? selectedPipelineEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isFirstSection={preRuleOps.length === 0 && ruleStages.length === 0}
          isLastSection={visualMappings.length === 0}
        />
        <PipelineSection
          title="Visual Mapping"
          entries={visualMappings}
          executionContext="gpu"
          selectedId={focusedOpId ?? selectedPipelineEntryId}
          onSelectEntry={handleSelectEntry}
          onToggleEnabled={handleToggleEnabled}
          isFirstSection={preRuleOps.length === 0 && ruleStages.length === 0 && postRuleOps.length === 0}
          isLastSection
        />
      </div>
    </div>
  );
}
