/**
 * PipelineSection: collapsible section grouping pipeline entries by phase.
 *
 * The section header is a node on the outer (section-level) connector line.
 * When expanded, entries render with both the outer continuation line and
 * their own inner connector line (indented one level).
 */

'use client';

import { useState, useCallback } from 'react';
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
  defaultExpanded = true,
  isLastSection = false,
  isFirstSection = false,
}: PipelineSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

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
          <PipelineEntryRow
            key={entry.id}
            entry={entry}
            isSelected={selectedId === entry.id || selectedId === entry.opId}
            onSelect={() => onSelectEntry(entry)}
            onToggleEnabled={onToggleEnabled ? () => onToggleEnabled(entry) : undefined}
            showOuterLine={!isLastSection}
            isLastInner={i === entries.length - 1}
          />
        ))}
    </div>
  );
}
