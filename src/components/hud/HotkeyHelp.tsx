/**
 * HotkeyHelp: keyboard shortcut help overlay.
 *
 * GUIP-03: Contextual HUD menu showing all keyboard shortcuts.
 * GUIP-04: Displays shortcut bindings in a two-column layout.
 *
 * Also displays app title and current preset at the top.
 * Toggled via '?' key or ui.toggleHotkeyHelp command.
 */

'use client';

import { useEffect } from 'react';
import { useUiStore } from '@/store/uiStore';
import { useSimStore } from '@/store/simStore';
import { DEFAULT_SHORTCUTS } from '@/commands/KeyboardShortcutManager';

export function HotkeyHelp() {
  const isOpen = useUiStore((s) => s.isHotkeyHelpOpen);
  const activePreset = useSimStore((s) => s.activePreset);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useUiStore.setState({ isHotkeyHelpOpen: false });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="hotkey-help-overlay"
      onClick={() => useUiStore.setState({ isHotkeyHelpOpen: false })}
    >
      <div
        className="bg-zinc-900/95 border border-zinc-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* App title + preset */}
        <div className="mb-4 pb-3 border-b border-zinc-800">
          <h1 className="text-sm font-mono text-zinc-400 tracking-wider uppercase">
            Lattice
          </h1>
          {activePreset && (
            <p className="text-xs font-mono text-zinc-600 mt-0.5">
              {activePreset}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-mono text-zinc-300 uppercase tracking-wider">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => useUiStore.setState({ isHotkeyHelpOpen: false })}
            className="text-zinc-500 hover:text-zinc-300 text-xs"
            aria-label="Close"
          >
            {'\u2715'}
          </button>
        </div>

        <div className="space-y-1" data-testid="hotkey-help-list">
          {DEFAULT_SHORTCUTS.map((shortcut, i) => (
            <div
              key={`${shortcut.commandName}-${shortcut.keyLabel}-${i}`}
              className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0"
            >
              <span className="text-xs font-mono text-zinc-400">
                {shortcut.description}
              </span>
              <kbd className="text-xs font-mono text-zinc-300 bg-zinc-700 px-2 py-0.5 rounded min-w-[60px] text-center">
                {shortcut.keyLabel}
              </kbd>
            </div>
          ))}
        </div>

        <p className="text-[10px] font-mono text-zinc-600 mt-4 text-center">
          Press ? or Escape to close
        </p>
      </div>
    </div>
  );
}
