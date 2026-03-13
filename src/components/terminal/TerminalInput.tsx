/**
 * TerminalInput: command input line with ghost-text autocomplete.
 */

'use client';

import { useRef, useEffect, type KeyboardEvent, type ChangeEvent, type ReactNode } from 'react';

/** Render ghost text with the first <param> or [param] placeholder highlighted. */
function renderGhostSegments(ghost: string): ReactNode {
  const match = ghost.match(/^(\s*)(<[^>]+>|\[[^\]]+\])(.*)/);
  if (match) {
    const [, prefix, placeholder, rest] = match;
    return (
      <>
        <span className="text-zinc-600">{prefix}</span>
        <span className="text-green-500/40">{placeholder}</span>
        <span className="text-zinc-600">{rest}</span>
      </>
    );
  }
  return <span className="text-zinc-600">{ghost}</span>;
}

interface TerminalInputProps {
  value: string;
  ghostText: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onNavigateHistory: (direction: 'up' | 'down') => void;
  onAcceptGhostText: () => void;
}

export function TerminalInput({
  value,
  ghostText,
  onChange,
  onSubmit,
  onNavigateHistory,
  onAcceptGhostText,
}: TerminalInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(value);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      onAcceptGhostText();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onNavigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNavigateHistory('down');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onChange('');
    } else if (e.key === '`' && !e.ctrlKey && !e.metaKey) {
      // Prevent plain backtick from toggling terminal while typing,
      // but allow Ctrl+` through to close the terminal
      e.stopPropagation();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="flex items-center px-3 py-1.5 border-t border-zinc-800 font-mono text-[13px]">
      <span className="text-green-500 mr-2 select-none">&gt;</span>
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent text-zinc-200 outline-none caret-green-500"
          spellCheck={false}
          autoComplete="off"
          data-testid="terminal-input"
        />
        {/* Ghost text overlay */}
        {ghostText && (
          <span
            className="absolute left-0 top-0 pointer-events-none"
            style={{ paddingLeft: `${value.length}ch` }}
          >
            {renderGhostSegments(ghostText)}
          </span>
        )}
      </div>
    </div>
  );
}
