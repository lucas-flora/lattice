/**
 * NodeEditorToolbar: top bar with compile, auto-layout, zoom-to-fit,
 * tag selector, and code/node view toggle.
 */

'use client';

import { useCallback } from 'react';

interface NodeEditorToolbarProps {
  tagId: string | undefined;
  tagOptions: { id: string; name: string }[];
  onTagChange: (tagId: string) => void;
  onCompile: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  showCode: boolean;
  onToggleCode: () => void;
  syncStatus: 'synced' | 'code-edited' | 'code-only';
}

const STATUS_COLORS = {
  synced: 'bg-green-500',
  'code-edited': 'bg-amber-500',
  'code-only': 'bg-zinc-500',
};

const STATUS_LABELS = {
  synced: 'In sync',
  'code-edited': 'Code edited',
  'code-only': 'Code only',
};

export function NodeEditorToolbar({
  tagId,
  tagOptions,
  onTagChange,
  onCompile,
  onAutoLayout,
  onFitView,
  showCode,
  onToggleCode,
  syncStatus,
}: NodeEditorToolbarProps) {
  const handleTagChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onTagChange(e.target.value);
    },
    [onTagChange],
  );

  return (
    <div className="flex items-center px-2 py-1 border-b border-zinc-800 bg-zinc-900/95 gap-1.5 shrink-0">
      {/* Tag selector */}
      <select
        className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-green-500/50 max-w-[160px]"
        value={tagId ?? ''}
        onChange={handleTagChange}
      >
        <option value="">No tag selected</option>
        {tagOptions.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Sync status */}
      <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[syncStatus]}`} />
        {STATUS_LABELS[syncStatus]}
      </div>

      <div className="flex-1" />

      {/* Action buttons */}
      <button
        className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        onClick={onCompile}
        title="Compile graph to code"
      >
        Compile
      </button>
      <button
        className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        onClick={onAutoLayout}
        title="Auto-layout nodes"
      >
        Layout
      </button>
      <button
        className="px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
        onClick={onFitView}
        title="Zoom to fit (H)"
      >
        Fit
      </button>
      <button
        className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors ${
          showCode
            ? 'bg-zinc-700 text-zinc-200'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
        onClick={onToggleCode}
        title="Toggle code preview"
      >
        Code
      </button>
    </div>
  );
}
