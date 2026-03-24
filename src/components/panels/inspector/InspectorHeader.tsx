/**
 * InspectorHeader: shared header for all Inspector detail views.
 *
 * Renders: type icon, editable name, type badge, enabled toggle, delete button.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { commandRegistry } from '@/commands/CommandRegistry';

interface InspectorHeaderProps {
  nodeId: string;
  name: string;
  typeLabel: string;
  typeColor?: string;
  icon?: React.ReactNode;
  editable?: boolean;
  showEnabled?: boolean;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  showDelete?: boolean;
  onDelete?: () => void;
}

export function InspectorHeader({
  nodeId,
  name,
  typeLabel,
  typeColor = 'bg-zinc-800 text-zinc-500',
  icon,
  editable = true,
  showEnabled = false,
  enabled = true,
  onEnabledChange,
  showDelete = false,
  onDelete,
}: InspectorHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(name);
    setEditing(false);
  }, [name, nodeId]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      commandRegistry.execute('scene.rename', { id: nodeId, name: trimmed });
    }
    setEditing(false);
  }, [editValue, name, nodeId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') { setEditValue(name); setEditing(false); }
  }, [commitRename, name]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-700/50">
      {/* Type icon */}
      {icon && <span className="text-[11px] shrink-0">{icon}</span>}

      {/* Name (editable) */}
      {editing ? (
        <input
          ref={inputRef}
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-green-400 font-mono rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-green-500/50"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          autoFocus
        />
      ) : (
        <span
          className={`text-green-400 text-[11px] font-mono truncate flex-1 min-w-0 ${editable ? 'cursor-pointer hover:underline' : ''}`}
          onClick={editable ? () => setEditing(true) : undefined}
          title={editable ? 'Click to rename' : undefined}
        >
          {name}
        </span>
      )}

      {/* Type badge */}
      <span className={`text-[9px] px-1 rounded font-mono leading-tight shrink-0 ${typeColor}`}>
        {typeLabel}
      </span>

      {/* Enabled toggle */}
      {showEnabled && (
        <span
          onClick={() => onEnabledChange?.(!enabled)}
          className={`text-[9px] px-1 rounded cursor-pointer shrink-0 leading-tight ${
            enabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-500'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </span>
      )}

      {/* Delete */}
      {showDelete && (
        <button
          onClick={onDelete}
          className="text-zinc-600 hover:text-red-400 text-[9px] cursor-pointer shrink-0"
          title="Delete"
        >
          &times;
        </button>
      )}
    </div>
  );
}
