/**
 * TagRow: displays a single ExpressionTag with expand-to-edit capability.
 *
 * Collapsed state shows source badge, name, owner, phase, toggle, and delete.
 * Expanded state is always the same: name + code + phase — because once created,
 * every tag is just code regardless of how it was authored.
 * All mutations go through commandRegistry.execute() (Three Surface Doctrine).
 */

'use client';

import { useState, useCallback } from 'react';
import type { ExpressionTag } from '@/engine/expression/types';
import { commandRegistry } from '@/commands/CommandRegistry';

const SOURCE_BADGE: Record<string, { label: string; class: string }> = {
  code: { label: '\u0192', class: 'text-green-400 bg-green-400/10' },
  link: { label: '\u0192', class: 'text-green-400 bg-green-400/10' }, // link-wizard tags show as expressions
  script: { label: '\u26A1', class: 'text-amber-400 bg-amber-400/10' },
};

function ownerLabel(owner: ExpressionTag['owner']): string | null {
  if (owner.type === 'root') return null;
  if (owner.type === 'cell-type') return `cell-type:${owner.id ?? ''}`;
  if (owner.type === 'environment') return 'env';
  if (owner.type === 'global') return 'global';
  return owner.type;
}

// ---------------------------------------------------------------------------
// Unified edit form — every tag is just name + code + phase
// ---------------------------------------------------------------------------

function TagEditForm({
  tag,
  onApply,
  onCancel,
}: {
  tag: ExpressionTag;
  onApply: (changes: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [code, setCode] = useState(tag.code);
  const [phase, setPhase] = useState(tag.phase);

  const ioDisplay =
    tag.inputs.length > 0 || tag.outputs.length > 0
      ? `${tag.inputs.join(', ') || '(none)'} → ${tag.outputs.join(', ') || '(none)'}`
      : null;

  return (
    <div className="mt-1.5 space-y-1.5" data-testid="tag-row-edit-form">
      {/* Name */}
      <input
        className="w-full bg-zinc-900 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="tag name"
      />

      {/* I/O info (read-only) */}
      {ioDisplay && (
        <div className="text-[10px] font-mono text-zinc-500 truncate" title={ioDisplay}>
          {ioDisplay}
        </div>
      )}

      {/* Code textarea */}
      <textarea
        className="w-full h-24 bg-zinc-900 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none resize-y focus:ring-1 focus:ring-green-500/50"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
      />

      {/* Phase selector */}
      <div className="flex items-center gap-3 text-[10px]">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name={`phase-${tag.id}`}
            checked={phase === 'pre-rule'}
            onChange={() => setPhase('pre-rule')}
            className="accent-blue-400"
          />
          <span className="text-blue-400">pre</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name={`phase-${tag.id}`}
            checked={phase === 'rule'}
            onChange={() => setPhase('rule')}
            className="accent-red-400"
          />
          <span className="text-red-400">rule</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name={`phase-${tag.id}`}
            checked={phase === 'post-rule'}
            onChange={() => setPhase('post-rule')}
            className="accent-amber-400"
          />
          <span className="text-amber-400">post</span>
        </label>
      </div>

      {/* Apply / Cancel */}
      <div className="flex gap-1">
        <button
          className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-0.5 cursor-pointer"
          onClick={() => onApply({ name, code, phase })}
          data-testid="tag-row-apply"
        >
          Apply
        </button>
        <button
          className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
          onClick={onCancel}
          data-testid="tag-row-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagRow (main component)
// ---------------------------------------------------------------------------

interface TagRowProps {
  tag: ExpressionTag;
}

export function TagRow({ tag }: TagRowProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = SOURCE_BADGE[tag.source] ?? SOURCE_BADGE.code;
  const owner = ownerLabel(tag.owner);

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleToggleEnabled = useCallback(() => {
    const cmd = tag.enabled ? 'tag.disable' : 'tag.enable';
    commandRegistry.execute(cmd, { id: tag.id });
  }, [tag.id, tag.enabled]);

  const handleDelete = useCallback(() => {
    commandRegistry.execute('tag.remove', { id: tag.id });
  }, [tag.id]);

  const handleApply = useCallback(
    (changes: Record<string, unknown>) => {
      commandRegistry.execute('tag.edit', { id: tag.id, ...changes });
      setExpanded(false);
    },
    [tag.id],
  );

  const handleCancel = useCallback(() => {
    setExpanded(false);
  }, []);

  return (
    <div className="bg-zinc-800 rounded p-2 group" data-testid="tag-row">
      {/* --- Collapsed row (always visible) --- */}
      <div className="flex items-center gap-1.5">
        {/* Source badge */}
        <span className={`text-[9px] font-mono px-1 py-0.5 rounded shrink-0 ${badge.class}`}>
          {badge.label}
        </span>

        {/* Link indicator (for tags created via link wizard) */}
        {tag.linkMeta && (
          <span className="text-[8px] text-blue-400/60" title="Created via link wizard">
            {'\u21C4'}
          </span>
        )}

        {/* Name (click to expand) */}
        <button
          className="text-xs font-mono text-zinc-300 truncate text-left flex-1 min-w-0 cursor-pointer hover:text-zinc-100"
          onClick={handleToggleExpand}
          data-testid="tag-row-toggle"
        >
          {tag.name}
        </button>

        {/* Owner badge */}
        {owner && (
          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 shrink-0">
            {owner}
          </span>
        )}

        {/* Phase badge */}
        <span
          className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
            tag.phase === 'pre-rule'
              ? 'bg-blue-500/10 text-blue-400'
              : tag.phase === 'rule'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-amber-500/10 text-amber-400'
          }`}
        >
          {tag.phase === 'pre-rule' ? 'pre' : tag.phase === 'rule' ? 'rule' : 'post'}
        </span>

        {/* ON/OFF toggle */}
        <button
          onClick={handleToggleEnabled}
          className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer shrink-0 ${
            tag.enabled
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-700 text-zinc-500'
          }`}
          data-testid="tag-row-enable"
        >
          {tag.enabled ? 'ON' : 'OFF'}
        </button>

        {/* Delete button (hover-visible) */}
        <button
          onClick={handleDelete}
          className="text-zinc-600 hover:text-red-400 text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          title="Remove tag"
          data-testid="tag-row-delete"
        >
          &times;
        </button>
      </div>

      {/* --- Expanded edit form (uniform for all sources) --- */}
      {expanded && (
        <TagEditForm tag={tag} onApply={handleApply} onCancel={handleCancel} />
      )}
    </div>
  );
}
