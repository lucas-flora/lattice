/**
 * PipelineEntryRow: a single row in the pipeline execution order.
 *
 * Renders with two connector columns:
 * - Outer connector: continuation of the section-level flow line
 * - Inner connector: entry-level dot + line within the expanded section
 *
 * Supports drag-to-reorder and Alt+Up/Down keyboard reorder.
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

const LINE_ENABLED = 'rgba(74, 222, 128, 0.2)';
const LINE_DISABLED = 'repeating-linear-gradient(to bottom, rgba(113,113,122,0.3) 0px, rgba(113,113,122,0.3) 2px, transparent 2px, transparent 4px)';

interface PipelineEntryRowProps {
  entry: PipelineEntry;
  isSelected: boolean;
  onSelect: () => void;
  onToggleEnabled?: () => void;
  /** Show the outer (section-level) continuation line */
  showOuterLine?: boolean;
  /** Is this the last entry in the inner group */
  isLastInner?: boolean;
  /** Whether this row is draggable */
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Keyboard reorder: Alt+Up/Down */
  onKeyReorder?: (direction: 'up' | 'down') => void;
}

export function PipelineEntryRow({
  entry,
  isSelected,
  onSelect,
  onToggleEnabled,
  showOuterLine = true,
  isLastInner = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onKeyReorder,
}: PipelineEntryRowProps) {
  const style = TYPE_STYLES[entry.type];

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleEnabled?.();
  }, [onToggleEnabled]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!onKeyReorder || !e.altKey) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onKeyReorder('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onKeyReorder('down');
    }
  }, [onKeyReorder]);

  return (
    <div
      className="flex"
      data-testid={`pipeline-entry-${entry.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Outer connector: just a continuation line (no dot — the section header has the dot) */}
      <div className="w-3 shrink-0 flex flex-col items-center">
        <div className="w-px flex-1" style={{ background: showOuterLine ? LINE_ENABLED : 'transparent' }} />
      </div>

      {/* Inner connector: dot + line for this entry */}
      <div className="w-3 shrink-0 flex flex-col items-center">
        <div className="w-px flex-1" style={{ background: entry.enabled ? LINE_ENABLED : LINE_DISABLED }} />
        <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${entry.enabled ? style.dotColor : 'bg-zinc-600'}`} />
        <div className="w-px flex-1" style={{ background: isLastInner ? 'transparent' : (entry.enabled ? LINE_ENABLED : LINE_DISABLED) }} />
      </div>

      {/* Entry content */}
      <button
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        className={`flex-1 flex items-center gap-1.5 pr-2 py-0.5 text-left transition-colors cursor-pointer rounded-r ${
          isSelected
            ? 'bg-green-500/10 ring-1 ring-green-500/30'
            : 'hover:bg-zinc-800/60'
        } ${!entry.enabled ? 'opacity-40' : ''}`}
      >
        {/* Drag handle indicator */}
        {draggable && (
          <span className="text-zinc-700 text-[9px] shrink-0 cursor-grab select-none" title="Drag to reorder">
            ⠿
          </span>
        )}

        {/* Index */}
        <span className="text-[9px] font-mono text-zinc-600 tabular-nums w-3 text-right shrink-0">
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
