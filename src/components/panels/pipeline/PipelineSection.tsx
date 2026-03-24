/**
 * PipelineSection: collapsible section grouping pipeline entries by phase.
 */

'use client';

import { useState, useCallback } from 'react';
import type { PipelineEntry } from '@/engine/rule/GPURuleRunner';
import { PipelineEntryRow } from './PipelineEntryRow';

interface PipelineSectionProps {
  title: string;
  entries: PipelineEntry[];
  executionContext: 'cpu' | 'gpu';
  selectedId: string | null;
  onSelectEntry: (entry: PipelineEntry) => void;
  onToggleEnabled?: (entry: PipelineEntry) => void;
  defaultExpanded?: boolean;
  /** Whether this is the last section with entries (no continuation below) */
  isLastSection?: boolean;
}

export function PipelineSection({
  title,
  entries,
  executionContext,
  selectedId,
  onSelectEntry,
  onToggleEnabled,
  defaultExpanded = true,
  isLastSection = false,
}: PipelineSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="mb-0.5">
      {/* Section header */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-zinc-600 text-[9px]">{expanded ? '\u25B4' : '\u25BE'}</span>
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

      {/* Entries with flow connectors */}
      {expanded && (
        <div>
          {entries.map((entry, i) => (
            <PipelineEntryRow
              key={entry.id}
              entry={entry}
              isSelected={selectedId === entry.id}
              onSelect={() => onSelectEntry(entry)}
              onToggleEnabled={onToggleEnabled ? () => onToggleEnabled(entry) : undefined}
              isLast={isLastSection && i === entries.length - 1}
              isFirstInSection={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
