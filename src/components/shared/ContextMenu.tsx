/**
 * ContextMenu: positioned right-click menu with action items.
 *
 * Renders at mouse position. Closes on click-outside, Escape, or item click.
 * Supports dividers and disabled items.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
  hidden?: boolean;
  /** Render a divider line before this item */
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to keep menu on-screen
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const el = menuRef.current;
    if (rect.right > window.innerWidth) {
      el.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }, [x, y]);

  const visibleItems = items.filter((i) => !i.hidden);
  if (visibleItems.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] bg-zinc-800 border border-zinc-600/50 rounded shadow-lg py-0.5"
      style={{ left: x, top: y }}
      data-testid="context-menu"
    >
      {visibleItems.map((item, i) => (
        <div key={i}>
          {item.divider && i > 0 && (
            <div className="mx-1.5 my-0.5 border-t border-zinc-700/60" />
          )}
          <button
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`w-full text-left text-[11px] font-mono px-2.5 py-1 transition-colors ${
              item.disabled
                ? 'text-zinc-600 cursor-default'
                : 'text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 cursor-pointer'
            }`}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
