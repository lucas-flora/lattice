/**
 * Terminal: slide-up CLI panel for command input and log output.
 *
 * Toggles via backtick key or Ctrl+`. Displays curated app logs,
 * accepts CLI commands with ghost-text autocomplete.
 */

'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { TerminalOutput } from './TerminalOutput';
import { TerminalInput } from './TerminalInput';
import { useTerminal } from './useTerminal';

export function Terminal() {
  const isOpen = useUiStore((s) => s.isTerminalOpen);
  const {
    output,
    inputValue,
    ghostText,
    handleInputChange,
    executeInput,
    navigateHistory,
    acceptGhostText,
  } = useTerminal();

  // Global keyboard shortcut: backtick or Ctrl+` toggles terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '`' && !e.ctrlKey && !e.metaKey) {
        // Only toggle if not typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        commandRegistry.execute('ui.toggleTerminal', {});
      } else if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        commandRegistry.execute('ui.toggleTerminal', {});
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 transition-transform duration-200 ease-out"
      style={{
        height: '30vh',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
      }}
      data-testid="terminal-panel"
    >
      <div className="h-full flex flex-col bg-zinc-900/95 border-t border-zinc-700 backdrop-blur-sm">
        {/* Header bar */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-zinc-800">
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Terminal</span>
          <button
            onClick={() => commandRegistry.execute('ui.toggleTerminal', {})}
            className="text-zinc-500 hover:text-zinc-300 text-xs px-1"
            aria-label="Close terminal"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Output */}
        <TerminalOutput entries={output} />

        {/* Input */}
        <TerminalInput
          value={inputValue}
          ghostText={ghostText}
          onChange={handleInputChange}
          onSubmit={executeInput}
          onNavigateHistory={navigateHistory}
          onAcceptGhostText={acceptGhostText}
        />
      </div>
    </div>
  );
}
