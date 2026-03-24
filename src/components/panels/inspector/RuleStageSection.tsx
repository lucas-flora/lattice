/**
 * RuleStageSection: Inspector detail for a rule stage (from PipelineEntry).
 *
 * Rule stages are not scene nodes — they come from the preset's rule.stages[].
 * The Pipeline View creates synthetic PipelineEntry objects for them.
 */

'use client';

import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';
import { getController } from '@/components/AppShell';
import { InspectorHeader } from './InspectorHeader';
import { LogicInspectorTabs } from './LogicInspectorTabs';

interface RuleStageSectionProps {
  entry: PipelineEntry;
}

export function RuleStageSection({ entry }: RuleStageSectionProps) {
  // Look up the compute source from the preset
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

  const handleEnabledChange = (enabled: boolean) => {
    if (!runner) return;
    runner.setStageEnabled(entry.sourceId!, enabled);
  };

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

      {/* Code preview (truncated in summary) */}
      <div>
        <div className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5">Compute</div>
        <pre className="text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-1.5 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words">
          {code || '(empty)'}
        </pre>
      </div>
    </div>
  );

  // Use a dummy SceneNode-shaped object for LogicInspectorTabs (it only uses it for key)
  const dummyNode = { id: entry.id, type: 'rule-stage', name: entry.name } as Parameters<typeof LogicInspectorTabs>[0]['node'];

  return (
    <>
      <InspectorHeader
        nodeId={entry.id}
        name={entry.name}
        typeLabel="Rule Stage"
        typeColor="bg-blue-500/15 text-blue-400"
        editable={false}
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
        />
      </div>
    </>
  );
}
