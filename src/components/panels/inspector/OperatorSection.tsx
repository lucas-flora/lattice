/**
 * OperatorSection: Inspector detail for an Operator (formerly ExpressionTag).
 *
 * Three-tab layout: Summary (phase, source, code, I/O) | Code (full source) | Nodes (placeholder).
 */

'use client';

import { useState, useCallback } from 'react';
import type { Operator } from '@/engine/expression/types';
import { commandRegistry } from '@/commands/CommandRegistry';
import { InspectorHeader } from './InspectorHeader';
import { LogicInspectorTabs } from './LogicInspectorTabs';

const PHASE_OPTIONS: Array<{ value: string; label: string; class: string }> = [
  { value: 'pre-rule', label: 'Pre', class: 'text-blue-400' },
  { value: 'post-rule', label: 'Post', class: 'text-amber-400' },
];

const SOURCE_LABELS: Record<string, string> = {
  code: 'Code',
  link: 'Link',
  script: 'Script',
};

interface OperatorSectionProps {
  op: Operator;
}

export function OperatorSection({ op }: OperatorSectionProps) {
  const [editCode, setEditCode] = useState(op.code);
  const [dirty, setDirty] = useState(false);

  const handlePhaseChange = useCallback((phase: string) => {
    commandRegistry.execute('op.edit', { id: op.id, phase });
  }, [op.id]);

  const handleCodeChange = useCallback((value: string) => {
    setEditCode(value);
    setDirty(true);
  }, []);

  const handleApply = useCallback(() => {
    commandRegistry.execute('op.edit', { id: op.id, code: editCode });
    setDirty(false);
  }, [op.id, editCode]);

  const handleEnabledChange = useCallback((enabled: boolean) => {
    const cmd = enabled ? 'op.enable' : 'op.disable';
    commandRegistry.execute(cmd, { id: op.id });
  }, [op.id]);

  const handleDelete = useCallback(() => {
    commandRegistry.execute('op.remove', { id: op.id });
  }, [op.id]);

  const summaryContent = (
    <div className="space-y-2">
      {/* Phase + source */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {PHASE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePhaseChange(opt.value)}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded cursor-pointer ${
                op.phase === opt.value
                  ? `${opt.class} bg-current/10 ring-1 ring-current/30`
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-[9px] font-mono px-1 rounded bg-zinc-800 text-zinc-500">
          {SOURCE_LABELS[op.source] ?? op.source}
        </span>
      </div>

      {/* Code editor */}
      <div>
        <div className="text-[9px] font-mono text-zinc-500 uppercase mb-0.5">Code</div>
        <textarea
          className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-1.5 resize-y min-h-[60px] max-h-[200px] focus:outline-none focus:border-green-500/50"
          value={editCode}
          onChange={(e) => handleCodeChange(e.target.value)}
          spellCheck={false}
          rows={Math.min(8, editCode.split('\n').length + 1)}
        />
        {dirty && (
          <button
            onClick={handleApply}
            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer mt-0.5"
          >
            Apply
          </button>
        )}
      </div>

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
          codeLang="Python"
        />
      </div>
    </>
  );
}
