/**
 * OperatorSection: Inspector detail for an Operator (formerly ExpressionTag).
 *
 * Three-tab layout: Summary (read-only overview) | Code (full editor) | Nodes (open in editor).
 */

'use client';

import { useCallback } from 'react';
import type { Operator } from '@/engine/expression/types';
import { commandRegistry } from '@/commands/CommandRegistry';
import { InspectorHeader } from './InspectorHeader';
import { LogicInspectorTabs } from './LogicInspectorTabs';
import { hasNodeGraphComment } from '@/engine/nodes/NodeDecompiler';

const SOURCE_LABELS: Record<string, string> = {
  code: 'Code',
  link: 'Link',
  script: 'Script',
};

interface OperatorSectionProps {
  op: Operator;
}

export function OperatorSection({ op }: OperatorSectionProps) {
  const handleEnabledChange = useCallback((enabled: boolean) => {
    const cmd = enabled ? 'op.enable' : 'op.disable';
    commandRegistry.execute(cmd, { id: op.id });
  }, [op.id]);

  const handleDelete = useCallback(() => {
    commandRegistry.execute('op.remove', { id: op.id });
  }, [op.id]);

  const handleCodeChange = useCallback((code: string) => {
    commandRegistry.execute('op.edit', { id: op.id, code });
  }, [op.id]);

  const handlePhaseChange = useCallback((phase: string) => {
    commandRegistry.execute('op.edit', { id: op.id, phase });
  }, [op.id]);

  // Summary tab: read-only overview
  const summaryContent = (
    <div className="space-y-2">
      {/* Phase + source badges */}
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
          op.phase === 'rule' ? 'bg-red-500/10 text-red-400' :
          op.phase === 'pre-rule' ? 'bg-blue-500/10 text-blue-400' :
          'bg-amber-500/10 text-amber-400'
        }`}>
          {op.phase}
        </span>
        <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-zinc-500">
          {SOURCE_LABELS[op.source] ?? op.source}
        </span>
      </div>

      {/* Code preview (read-only) */}
      {op.code && (
        <div>
          <div className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5">Code</div>
          <pre className="w-full text-[10px] font-mono text-zinc-500 bg-zinc-800/40 rounded border border-zinc-700/30 p-1.5 whitespace-pre-wrap max-h-[200px] overflow-y-auto select-text">
            {op.code}
          </pre>
        </div>
      )}

      {/* Inputs / Outputs */}
      {(op.inputs.length > 0 || op.outputs.length > 0) && (
        <div className="space-y-1">
          {op.inputs.length > 0 && (
            <div className="text-[10px] font-mono">
              <span className="text-zinc-500">in: </span>
              <span className="text-zinc-400">{op.inputs.join(', ')}</span>
            </div>
          )}
          {op.outputs.length > 0 && (
            <div className="text-[10px] font-mono">
              <span className="text-zinc-500">out: </span>
              <span className="text-zinc-400">{op.outputs.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Link metadata */}
      {op.linkMeta && (
        <div className="text-[10px] font-mono space-y-0.5 border-t border-zinc-800 pt-1">
          <div className="text-zinc-500 text-[9px] uppercase">Link</div>
          <div className="text-zinc-400">
            {op.linkMeta.sourceAddress} [{op.linkMeta.sourceRange.join(',')}]
            {' \u2192 '}
            [{op.linkMeta.targetRange.join(',')}] {op.linkMeta.easing}
          </div>
        </div>
      )}
    </div>
  );

  const dummyNode = { id: op.id, type: 'operator', name: op.name } as Parameters<typeof LogicInspectorTabs>[0]['node'];
  const opHasGraph = !!op.nodeGraph || (op.code ? hasNodeGraphComment(op.code) : false);
  const nodeCount = op.nodeGraph?.nodes.length;
  const edgeCount = op.nodeGraph?.edges.length;

  return (
    <>
      <InspectorHeader
        nodeId={op.id}
        name={op.name}
        typeLabel="Operator"
        typeColor="bg-green-500/15 text-green-400"
        showEnabled
        enabled={op.enabled}
        onEnabledChange={handleEnabledChange}
        showDelete
        onDelete={handleDelete}
      />
      <div className="px-2 py-1.5">
        <LogicInspectorTabs
          node={dummyNode}
          summaryContent={summaryContent}
          code={op.code}
          phase={op.phase}
          codeLang="Python"
          onCodeChange={handleCodeChange}
          onPhaseChange={handlePhaseChange}
          opId={op.id}
          hasNodeGraph={opHasGraph}
          nodeCount={nodeCount}
          edgeCount={edgeCount}
        />
      </div>
    </>
  );
}
