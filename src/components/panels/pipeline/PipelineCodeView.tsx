/**
 * PipelineCodeView: read-only combined code view of the entire tick pipeline.
 *
 * Shows all pipeline stages concatenated into one scrollable script.
 * Section headers are clickable — navigates to the individual entry's detail.
 */

'use client';

import { useMemo, useCallback, useRef, useEffect } from 'react';
import type { PipelineSectionMeta } from '@/commands/definitions/pipeline';
import { commandRegistry } from '@/commands/CommandRegistry';

interface PipelineCodeViewProps {
  code: string;
  sections: PipelineSectionMeta[];
  /** Called when user clicks a section header to navigate to that entry */
  onNavigateToEntry: (entryId: string) => void;
}

export function PipelineCodeView({ code, sections, onNavigateToEntry }: PipelineCodeViewProps) {
  const lines = useMemo(() => code.split('\n'), [code]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build a set of line numbers that are section header starts (the separator lines)
  const sectionHeaderLines = useMemo(() => {
    const map = new Map<number, PipelineSectionMeta>();
    for (const section of sections) {
      // The clickable line is lineStart + 1 (the label line between separators)
      map.set(section.lineStart, section);
      map.set(section.lineStart + 1, section);
      map.set(section.lineStart + 2, section);
    }
    return map;
  }, [sections]);

  const handleLineClick = useCallback((lineIdx: number) => {
    const section = sectionHeaderLines.get(lineIdx);
    if (section) {
      onNavigateToEntry(section.entryId);
    }
  }, [sectionHeaderLines, onNavigateToEntry]);

  // Line number gutter width based on total lines
  const gutterWidth = Math.max(3, String(lines.length).length);

  return (
    <div className="flex flex-col h-full">
      {/* Hint */}
      <div className="px-2 py-1 text-[9px] text-zinc-600 border-b border-zinc-700/50 shrink-0">
        Read-only overview. Click a section header to edit.
      </div>

      {/* Code area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto font-mono text-[10px] leading-[16px]">
        {lines.map((line, i) => {
          const section = sectionHeaderLines.get(i);
          const isSeparator = line.startsWith('# ═');
          const isHeader = section && !isSeparator && line.startsWith('# ');
          const isDisabledCode = !section && line.startsWith('# ') && !isSeparator;

          return (
            <div
              key={i}
              className={`flex ${
                section
                  ? 'cursor-pointer hover:bg-zinc-700/40'
                  : ''
              } ${
                isSeparator || isHeader
                  ? 'bg-zinc-800/40'
                  : ''
              }`}
              onClick={section ? () => handleLineClick(i) : undefined}
            >
              {/* Line number gutter */}
              <span
                className="text-zinc-700 text-right pr-2 pl-1 select-none shrink-0 tabular-nums"
                style={{ width: `${gutterWidth + 2}ch` }}
              >
                {i + 1}
              </span>

              {/* Code content */}
              <span
                className={`flex-1 pr-2 whitespace-pre ${
                  isSeparator
                    ? 'text-zinc-600'
                    : isHeader
                      ? 'text-zinc-300 font-semibold'
                      : isDisabledCode
                        ? 'text-zinc-600 italic'
                        : 'text-zinc-400'
                }`}
              >
                {line}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
