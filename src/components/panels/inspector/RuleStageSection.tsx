/**
 * RuleStageSection: Inspector detail for a rule stage (from PipelineEntry).
 *
 * Everything is editable — fork-on-modify protects the original preset.
 */

'use client';

import { useState, useCallback } from 'react';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';
import { getController } from '@/components/AppShell';
import { InspectorHeader } from './InspectorHeader';
import { LogicInspectorTabs } from './LogicInspectorTabs';

interface RuleStageSectionProps {
  entry: PipelineEntry;
}

export function RuleStageSection({ entry }: RuleStageSectionProps) {
  const ctrl = getController();
  const runner = ctrl?.getGPURuleRunner();
  const preset = runner?.getPreset();
  const stages = preset?.rule.stages;
  const singleCompute = preset?.rule.compute;

  const stageIndex = stages
    ? stages.findIndex((s) => s.name === entry.sourceId)
    : 0;
  const stageCount = stages ? stages.length : 1;
  const stageConfig = stages?.[stageIndex];
  const code = stageConfig?.compute ?? singleCompute ?? '';
  const iterations = stageConfig?.iterations ?? 1;

  const [editCode, setEditCode] = useState(code);

  const handleEnabledChange = useCallback((enabled: boolean) => {
    if (!runner) return;
    runner.setStageEnabled(entry.sourceId!, enabled);
  }, [runner, entry.sourceId]);

  const handleCodeApply = useCallback(() => {
    // Future: recompile the stage with updated code.
    // For now, store locally — full recompile wiring is a separate task.
  }, []);

  const summaryContent = (
    <div className="space-y-2">
      {/* Position and iterations */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-zinc-400">
          Stage {stageIndex + 1} of {stageCount}
        </span>
        {iterations > 1 && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
            {iterations}&times; per tick
          </span>
        )}
        <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-zinc-500">
          GPU
        </span>
      </div>

      {/* Code editor (editable in summary too) */}
      <div>
        <div className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5">Compute</div>
        <textarea
          className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-1.5 resize-y min-h-[60px] max-h-[200px] focus:outline-none focus:border-green-500/50"
          value={editCode}
          onChange={(e) => setEditCode(e.target.value)}
          spellCheck={false}
          rows={Math.min(8, editCode.split('\n').length + 1)}
        />
      </div>
    </div>
  );

  const dummyNode = { id: entry.id, type: 'rule-stage', name: entry.name } as Parameters<typeof LogicInspectorTabs>[0]['node'];

  return (
    <>
      <InspectorHeader
        nodeId={entry.id}
        name={entry.name}
        typeLabel="Rule Stage"
        typeColor="bg-blue-500/15 text-blue-400"
        editable
        showEnabled
        enabled={entry.enabled}
        onEnabledChange={handleEnabledChange}
      />
      <div className="px-2 py-1.5">
        <LogicInspectorTabs
          node={dummyNode}
          summaryContent={summaryContent}
          code={code}
          codeLang="Python (transpiled to WGSL)"
          onCodeChange={handleCodeApply}
        />
      </div>
    </>
  );
}
