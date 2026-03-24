/**
 * PipelineEntryRow: a single row in the pipeline execution order.
 *
 * Shows flow connector (dot + line), index, name, type badge, enabled toggle.
 * Click selects the entry; for visual-mapping entries, also selects the scene node.
 */

'use client';

import { useCallback } from 'react';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';

const TYPE_STYLES: Record<PipelineEntry['type'], { label: string; class: string; dotColor: string }> = {
  'rule-stage':    { label: 'rule',    class: 'bg-blue-500/15 text-blue-400',     dotColor: 'bg-blue-400' },
  'pre-rule-op':   { label: 'pre',     class: 'bg-zinc-700 text-zinc-400',        dotColor: 'bg-zinc-500' },
  'post-rule-op':  { label: 'post',    class: 'bg-green-500/15 text-green-400',   dotColor: 'bg-green-400' },
  'visual-mapping':{ label: 'visual',  class: 'bg-purple-500/15 text-purple-400', dotColor: 'bg-purple-400' },
};

interface PipelineEntryRowProps {
  entry: PipelineEntry;
  isSelected: boolean;
  onSelect: () => void;
  onToggleEnabled?: () => void;
  /** Whether this is the last entry (no continuation line below) */
  isLast?: boolean;
  /** Whether this is the first entry in a new section */
  isFirstInSection?: boolean;
}

export function PipelineEntryRow({ entry, isSelected, onSelect, onToggleEnabled, isLast, isFirstInSection }: PipelineEntryRowProps) {
  const style = TYPE_STYLES[entry.type];

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleEnabled?.();
  }, [onToggleEnabled]);

  return (
    <div className="flex" data-testid={`pipeline-entry-${entry.id}`}>
      {/* Flow connector column */}
      <div className="w-4 shrink-0 flex flex-col items-center relative">
        {/* Line above dot (section gap if first in section) */}
        <div
          className={`w-px flex-1 ${
            isFirstInSection ? 'bg-transparent' : entry.enabled ? '' : ''
          }`}
          style={{
            background: isFirstInSection
              ? 'transparent'
              : entry.enabled
                ? 'rgba(74, 222, 128, 0.2)'
                : 'repeating-linear-gradient(to bottom, rgba(113,113,122,0.3) 0px, rgba(113,113,122,0.3) 2px, transparent 2px, transparent 4px)',
            minHeight: isFirstInSection ? '4px' : undefined,
          }}
        />
        {/* Node dot */}
        <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${entry.enabled ? style.dotColor : 'bg-zinc-600'}`} />
        {/* Line below dot */}
        {!isLast && (
          <div
            className="w-px flex-1"
            style={{
              background: entry.enabled
                ? 'rgba(74, 222, 128, 0.2)'
                : 'repeating-linear-gradient(to bottom, rgba(113,113,122,0.3) 0px, rgba(113,113,122,0.3) 2px, transparent 2px, transparent 4px)',
            }}
          />
        )}
      </div>

      {/* Entry content */}
      <button
        onClick={onSelect}
        className={`flex-1 flex items-center gap-1.5 pr-2 py-1 text-left transition-colors cursor-pointer rounded-r ${
          isSelected
            ? 'bg-green-500/10 ring-1 ring-green-500/30'
            : 'hover:bg-zinc-800/60'
        } ${!entry.enabled ? 'opacity-40' : ''}`}
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

        {/* Enabled toggle */}
        <span
          onClick={handleToggle}
          className={`text-[9px] px-1 rounded shrink-0 leading-tight cursor-pointer ${
            entry.enabled
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-500'
          }`}
        >
          {entry.enabled ? 'ON' : 'OFF'}
        </span>
      </button>
    </div>
  );
}
