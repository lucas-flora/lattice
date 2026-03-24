/**
 * PipelineEntryRow: a single row in the pipeline execution order.
 *
 * Shows index, name, type badge, iterations badge, and enabled toggle.
 * Click selects in sceneStore so the Inspector shows detail.
 */

'use client';

import { useCallback } from 'react';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';

const TYPE_STYLES: Record<PipelineEntry['type'], { label: string; class: string }> = {
  'rule-stage':    { label: 'rule',    class: 'bg-blue-500/15 text-blue-400' },
  'pre-rule-op':   { label: 'pre',     class: 'bg-zinc-700 text-zinc-400' },
  'post-rule-op':  { label: 'post',    class: 'bg-green-500/15 text-green-400' },
  'visual-mapping':{ label: 'visual',  class: 'bg-purple-500/15 text-purple-400' },
};

interface PipelineEntryRowProps {
  entry: PipelineEntry;
  isSelected: boolean;
  onSelect: () => void;
}

export function PipelineEntryRow({ entry, isSelected, onSelect }: PipelineEntryRowProps) {
  const style = TYPE_STYLES[entry.type];

  const handleClick = useCallback(() => {
    onSelect();
  }, [onSelect]);

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors cursor-pointer rounded ${
        isSelected
          ? 'bg-green-500/10 ring-1 ring-green-500/30'
          : 'hover:bg-zinc-800/60'
      } ${!entry.enabled ? 'opacity-40' : ''}`}
      data-testid={`pipeline-entry-${entry.id}`}
    >
      {/* Index */}
      <span className="text-[9px] font-mono text-zinc-600 tabular-nums w-4 text-right shrink-0">
        {entry.index + 1}
      </span>

      {/* Name */}
      <span className="text-[11px] font-mono text-zinc-300 flex-1 truncate min-w-0">
        {entry.name}
      </span>

      {/* Iterations badge */}
      {entry.iterations && entry.iterations > 1 && (
        <span className="text-[9px] font-mono px-1 rounded bg-blue-500/10 text-blue-400 shrink-0 tabular-nums">
          &times;{entry.iterations}
        </span>
      )}

      {/* Type badge */}
      <span className={`text-[9px] font-mono px-1 rounded shrink-0 leading-tight ${style.class}`}>
        {style.label}
      </span>

      {/* Context badge */}
      <span className="text-[8px] font-mono text-zinc-600 shrink-0 uppercase">
        {entry.executionContext}
      </span>
    </button>
  );
}
