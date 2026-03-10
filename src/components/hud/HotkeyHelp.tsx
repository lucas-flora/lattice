/**
 * HotkeyHelp: keyboard shortcut help overlay.
 *
 * GUIP-03: Contextual HUD menu showing all keyboard shortcuts.
 * GUIP-04: Displays shortcut bindings in a two-column layout.
 *
 * Toggled via '?' key or ui.toggleHotkeyHelp command.
 */

'use client';

import { useUiStore } from '@/store/uiStore';
import { DEFAULT_SHORTCUTS } from '@/commands/KeyboardShortcutManager';

export function HotkeyHelp() {
  const isOpen = useUiStore((s) => s.isHotkeyHelpOpen);

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
          {DEFAULT_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.commandName}
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
