/**
 * TerminalOutput: scrollable output log showing timestamped, color-coded entries.
 *
 * Renders structured data (code blocks, tables, key-value pairs, JSON) inline
 * below the message line when entry.data is present.
 */

'use client';

import { useRef, useEffect } from 'react';
import type { LogEntry, StructuredData } from './useTerminal';

const TYPE_COLORS: Record<string, string> = {
  command: '#22d3ee', // cyan-400
  info: '#a1a1aa',    // zinc-400
  error: '#ef4444',   // red-500
  ai: '#a78bfa',      // violet-400
};

const KEYWORD_RE = /\b(const|let|var|return|if|else|for|while|function|class|import|export|new|this|throw|try|catch|switch|case|break|continue|default|typeof|instanceof|void|delete|in|of|async|await|yield)\b/g;
const STRING_RE = /(["'`])(?:(?!\1|\\).|\\.)*\1/g;

function highlightCode(code: string): string {
  // Replace strings first (so keywords inside strings aren't highlighted)
  const strings: string[] = [];
  let withPlaceholders = code.replace(STRING_RE, (match) => {
    strings.push(match);
    return `__STR_${strings.length - 1}__`;
  });

  // Highlight keywords
  withPlaceholders = withPlaceholders.replace(
    KEYWORD_RE,
    '<span style="color:#60a5fa">$1</span>',
  );

  // Restore strings with highlighting
  withPlaceholders = withPlaceholders.replace(/__STR_(\d+)__/g, (_, idx) => {
    return `<span style="color:#4ade80">${strings[parseInt(idx)]}</span>`;
  });

  return withPlaceholders;
}

function CodeBlock({ content }: { content: string }) {
  const lines = content.split('\n');
  const gutterWidth = String(lines.length).length;

  return (
    <pre className="bg-zinc-800 rounded p-2 text-[11px] overflow-x-auto whitespace-pre mt-1">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="text-zinc-600 select-none pr-3 text-right" style={{ minWidth: `${gutterWidth + 1}ch` }}>
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: highlightCode(line) }} />
        </div>
      ))}
    </pre>
  );
}

function isNumeric(s: string): boolean {
  return !isNaN(Number(s)) && s.trim() !== '';
}

function DataTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <table className="font-mono text-[11px] mt-1 w-full">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col} className="text-zinc-500 uppercase text-left px-2 py-0.5 font-normal">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-zinc-800/50">
            {row.map((cell, j) => (
              <td key={j} className={`px-2 py-0.5 text-zinc-200 ${isNumeric(cell) ? 'text-right' : ''}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function KeyValuePairs({ pairs }: { pairs: [string, string][] }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 mt-1 text-[11px] font-mono">
      {pairs.map(([key, value]) => (
        <div key={key} className="contents">
          <span className="text-zinc-500">{key}</span>
          <span className="text-zinc-200">{value}</span>
        </div>
      ))}
    </div>
  );
}

function JsonBlock({ content }: { content: unknown }) {
  return (
    <pre className="bg-zinc-800 rounded p-2 text-[11px] text-zinc-300 overflow-x-auto whitespace-pre mt-1">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

function StructuredDataRenderer({ data }: { data: StructuredData }) {
  switch (data.kind) {
    case 'code':
      return <CodeBlock content={data.content} />;
    case 'table':
      return <DataTable columns={data.columns} rows={data.rows} />;
    case 'kv':
      return <KeyValuePairs pairs={data.pairs} />;
    case 'json':
      return <JsonBlock content={data.content} />;
  }
}

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
        <div key={entry.id}>
          <div className="flex gap-2">
            <span className="text-zinc-600 shrink-0 select-none">
              {formatTime(entry.timestamp)}
            </span>
            <span style={{ color: TYPE_COLORS[entry.type] || '#a1a1aa' }}>
              {entry.message}
            </span>
          </div>
          {entry.data && (
            <div className="ml-[4.5rem]">
              <StructuredDataRenderer data={entry.data} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
