/**
 * Terminal: CLI panel for command input and log output.
 *
 * Supports two display modes:
 * - floating: absolute-positioned overlay (default, toggled via T or `)
 * - docked: flex-child that takes layout space (toggled via Ctrl+`)
 */

'use client';

import { useUiStore } from '@/store/uiStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { TerminalOutput } from './TerminalOutput';
import { TerminalInput } from './TerminalInput';
import { useTerminal } from './useTerminal';

interface TerminalProps {
  docked?: boolean;
}

export function Terminal({ docked = false }: TerminalProps) {
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

  const terminalContent = (
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
  );

  if (docked) {
    return (
      <div className="shrink-0" style={{ height: '30vh' }} data-testid="terminal-panel">
        {terminalContent}
      </div>
    );
  }

  // Floating mode
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-20 pointer-events-auto ${isOpen ? '' : 'hidden'}`}
      style={{ height: '30vh' }}
      data-testid="terminal-panel"
    >
      {terminalContent}
    </div>
  );
}
