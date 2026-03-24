/**
 * LogicInspectorTabs: three-tab scaffold for logic-type objects.
 *
 * Summary | Code | Nodes
 *
 * Code tab is always an editable textarea (no read-only distinction
 * between built-in and user content — fork-on-modify protects originals).
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { SceneNode } from '@/engine/scene/SceneNode';

type TabId = 'summary' | 'code' | 'nodes';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'code', label: 'Code' },
  { id: 'nodes', label: 'Nodes' },
];

interface LogicInspectorTabsProps {
  node: SceneNode;
  summaryContent: React.ReactNode;
  code?: string;
  codeLang?: string;
  noCodeMessage?: string;
  /** Called when the user edits code in the Code tab */
  onCodeChange?: (code: string) => void;
}

export function LogicInspectorTabs({
  node,
  summaryContent,
  code,
  codeLang = 'WGSL',
  noCodeMessage,
  onCodeChange,
}: LogicInspectorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [editCode, setEditCode] = useState(code ?? '');
  const [dirty, setDirty] = useState(false);

  // Sync when code prop changes (selection change)
  useEffect(() => {
    setEditCode(code ?? '');
    setDirty(false);
  }, [code, node.id]);

  const handleCodeEdit = useCallback((value: string) => {
    setEditCode(value);
    setDirty(true);
  }, []);

  const handleApply = useCallback(() => {
    onCodeChange?.(editCode);
    setDirty(false);
  }, [editCode, onCodeChange]);

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-700/50 mb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1 text-[10px] font-mono transition-colors border-b-2 cursor-pointer ${
              activeTab === tab.id
                ? 'text-zinc-200 border-green-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'summary' && summaryContent}

      {activeTab === 'code' && (
        <div className="space-y-1">
          {code !== undefined ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-500 uppercase">{codeLang}</span>
                {dirty && onCodeChange && (
                  <button
                    onClick={handleApply}
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer"
                  >
                    Apply
                  </button>
                )}
              </div>
              <textarea
                className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-2 resize-y min-h-[80px] max-h-[300px] focus:outline-none focus:border-green-500/50"
                value={editCode}
                onChange={(e) => handleCodeEdit(e.target.value)}
                spellCheck={false}
                rows={Math.min(15, editCode.split('\n').length + 1)}
              />
            </>
          ) : (
            <div className="text-[11px] text-zinc-500 py-4 text-center">
              {noCodeMessage ?? 'No source code available for this object.'}
            </div>
          )}
        </div>
      )}

      {activeTab === 'nodes' && (
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
          <span className="text-zinc-400 text-[11px]">
            Visual node editor — coming soon
          </span>
          <span className="text-zinc-600 text-[10px] mt-1">
            This tab will show a node-graph view of this logic.
            For now, use the Code tab to view source.
          </span>
        </div>
      )}
    </div>
  );
}
