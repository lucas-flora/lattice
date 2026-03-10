/**
 * TerminalOutput: scrollable output log showing timestamped, color-coded entries.
 */

'use client';

import { useRef, useEffect } from 'react';
import type { LogEntry } from './useTerminal';

const TYPE_COLORS: Record<string, string> = {
  command: '#22d3ee', // cyan-400
  info: '#a1a1aa',    // zinc-400
  error: '#ef4444',   // red-500
  ai: '#a78bfa',      // violet-400
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface TerminalOutputProps {
  entries: LogEntry[];
}

export function TerminalOutput({ entries }: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-5"
      data-testid="terminal-output"
    >
      {entries.map((entry) => (
        <div key={entry.id} className="flex gap-2">
          <span className="text-zinc-600 shrink-0 select-none">
            {formatTime(entry.timestamp)}
          </span>
          <span style={{ color: TYPE_COLORS[entry.type] || '#a1a1aa' }}>
            {entry.message}
          </span>
        </div>
      ))}
    </div>
  );
}
