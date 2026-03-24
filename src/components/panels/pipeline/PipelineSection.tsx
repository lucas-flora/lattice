/**
 * PipelineSection: collapsible section grouping pipeline entries by phase.
 *
 * The section header is a node on the outer (section-level) connector line.
 * When expanded, entries render with both the outer continuation line and
 * their own inner connector line (indented one level).
 *
 * Supports drag-to-reorder within the section.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';
import { PipelineEntryRow } from './PipelineEntryRow';

const LINE_ENABLED = 'rgba(74, 222, 128, 0.2)';
const SECTION_DOT_COLORS: Record<string, string> = {
  'Pre-Rule Ops': 'bg-zinc-500',
  'Rule Stages': 'bg-blue-400',
  'Post-Rule Ops': 'bg-green-400',
  'Visual Mapping': 'bg-purple-400',
};

interface PipelineSectionProps {
  title: string;
  entries: PipelineEntry[];
  executionContext: 'cpu' | 'gpu';
  selectedId: string | null;
  onSelectEntry: (entry: PipelineEntry) => void;
  onToggleEnabled?: (entry: PipelineEntry) => void;
  onReorder?: (entryId: string, newIndex: number) => void;
  onEntryContextMenu?: (entry: PipelineEntry, e: React.MouseEvent) => void;
  defaultExpanded?: boolean;
  /** Is this the last section in the pipeline (no outer line below) */
  isLastSection?: boolean;
  /** Is this the first section (no outer line above) */
  isFirstSection?: boolean;
}

export function PipelineSection({
  title,
  entries,
  executionContext,
  selectedId,
  onSelectEntry,
  onToggleEnabled,
  onReorder,
  onEntryContextMenu,
  defaultExpanded = true,
  isLastSection = false,
  isFirstSection = false,
}: PipelineSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragSourceIndex = useRef<number | null>(null);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const canReorder = !!onReorder && entries.length > 1;

  // ── Drag handlers ──────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragSourceIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entries[index].id);
    // Add a subtle drag image
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '0.5';
  }, [entries]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.style.opacity = '1';
    dragSourceIndex.current = null;
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSourceIndex.current !== null && dragSourceIndex.current !== index) {
      setDragOverIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const srcIdx = dragSourceIndex.current;
    if (srcIdx === null || srcIdx === dropIndex || !onReorder) return;
    const entry = entries[srcIdx];
    onReorder(entry.id, dropIndex);
    dragSourceIndex.current = null;
  }, [entries, onReorder]);

  // ── Keyboard reorder ───────────────────────────────────────────────
  const handleKeyReorder = useCallback((index: number, direction: 'up' | 'down') => {
    if (!onReorder) return;
    const newIdx = direction === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= entries.length) return;
    onReorder(entries[index].id, newIdx);
  }, [entries, onReorder]);

  if (entries.length === 0) return null;

  const dotColor = SECTION_DOT_COLORS[title] ?? 'bg-zinc-500';

  return (
    <div>
      {/* Section header row — participates in the outer connector */}
      <div className="flex">
        {/* Outer connector: line above + dot + line below */}
        <div className="w-3 shrink-0 flex flex-col items-center">
          <div className="w-px flex-1" style={{ background: isFirstSection ? 'transparent' : LINE_ENABLED }} />
          <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${dotColor}`} />
          <div className="w-px flex-1" style={{ background: (isLastSection && !expanded) ? 'transparent' : LINE_ENABLED }} />
        </div>

        {/* Header content */}
        <button
          onClick={toggleExpanded}
          className="flex-1 flex items-center gap-1 py-1 pr-2 cursor-pointer hover:bg-zinc-800/40 transition-colors"
        >
          <span className="text-zinc-600 text-[9px]">{expanded ? '\u25BE' : '\u25B8'}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            {title}
          </span>
          <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
            ({entries.length})
          </span>
          <span className="text-[8px] font-mono px-1 rounded bg-zinc-800 text-zinc-600 uppercase ml-auto">
            {executionContext}
          </span>
        </button>
      </div>

      {/* Entries with nested connectors */}
      {expanded &&
        entries.map((entry, i) => (
          <div
            key={entry.id}
            className="relative"
            onDragOver={canReorder ? (e) => handleDragOver(e, i) : undefined}
            onDragLeave={canReorder ? handleDragLeave : undefined}
            onDrop={canReorder ? (e) => handleDrop(e, i) : undefined}
          >
            {/* Drop indicator line */}
            {dragOverIndex === i && dragSourceIndex.current !== null && dragSourceIndex.current !== i && (
              <div className="absolute left-6 right-2 top-0 h-[2px] bg-green-400 rounded z-10" />
            )}
            <PipelineEntryRow
              entry={entry}
              isSelected={selectedId != null && (selectedId === entry.id || selectedId === entry.opId)}
              onSelect={() => onSelectEntry(entry)}
              onToggleEnabled={onToggleEnabled ? () => onToggleEnabled(entry) : undefined}
              showOuterLine={!isLastSection}
              isLastInner={i === entries.length - 1}
              draggable={canReorder}
              onDragStart={canReorder ? (e) => handleDragStart(e, i) : undefined}
              onDragEnd={canReorder ? handleDragEnd : undefined}
              onKeyReorder={canReorder ? (dir) => handleKeyReorder(i, dir) : undefined}
              onContextMenu={onEntryContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); onEntryContextMenu(entry, e); } : undefined}
            />
          </div>
        ))}
    </div>
  );
}
