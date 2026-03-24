/**
 * LogicInspectorTabs: three-tab scaffold for logic-type scene nodes.
 *
 * Summary | Code | Nodes
 *
 * Used by visual mapping nodes and (future) rule stage nodes.
 * Operators use OpRow's inline expand-to-edit instead.
 */

'use client';

import { useState } from 'react';
import type { SceneNode } from '@/engine/scene/SceneNode';

type TabId = 'summary' | 'code' | 'nodes';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'code', label: 'Code' },
  { id: 'nodes', label: 'Nodes' },
];

interface LogicInspectorTabsProps {
  node: SceneNode;
  /** The Summary tab content (existing section component) */
  summaryContent: React.ReactNode;
  /** Source code to display in the Code tab */
  code?: string;
  /** Language label for the code block */
  codeLang?: string;
  /** Message when no code is available */
  noCodeMessage?: string;
}

export function LogicInspectorTabs({
  node,
  summaryContent,
  code,
  codeLang = 'WGSL',
  noCodeMessage,
}: LogicInspectorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');

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
          {code ? (
            <>
              <div className="text-[9px] font-mono text-zinc-500 uppercase">{codeLang}</div>
              <pre className="text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-2 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
                {code}
              </pre>
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
