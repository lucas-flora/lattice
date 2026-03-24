/**
 * ConfirmDialog: modal confirmation with title, message, and action buttons.
 *
 * Renders as a centered overlay portal. Closes on Escape or Cancel.
 */

'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Optional detail lines (e.g. list of dependents) */
  details?: string[];
  confirmLabel?: string;
  confirmDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  details,
  confirmLabel = 'Delete',
  confirmDestructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-zinc-800 border border-zinc-600/50 rounded-lg shadow-xl max-w-sm w-full mx-4 p-4"
        data-testid="confirm-dialog"
      >
        <div className="text-[13px] font-semibold text-zinc-200 mb-1.5">{title}</div>
        <div className="text-[11px] text-zinc-400 mb-3 font-mono">{message}</div>

        {details && details.length > 0 && (
          <div className="mb-3 bg-zinc-900/60 rounded border border-zinc-700/50 p-2 max-h-[120px] overflow-y-auto">
            {details.map((d, i) => (
              <div key={i} className="text-[10px] font-mono text-zinc-400">
                {d}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-[11px] font-mono text-zinc-400 hover:text-zinc-200 px-3 py-1 rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`text-[11px] font-mono px-3 py-1 rounded cursor-pointer ${
              confirmDestructive
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
            data-testid="confirm-dialog-confirm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
