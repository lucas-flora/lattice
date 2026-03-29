/**
 * LogicInspectorTabs: three-tab scaffold for logic-type objects.
 *
 * Summary — read-only overview (phase, code preview, I/O)
 * Code    — full interactive editor (textarea, phase, Apply/Cancel/Nodes)
 * Nodes   — graph summary and "Open in Editor" button
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import type { SceneNode } from '@/engine/scene/SceneNode';
import { commandRegistry } from '@/commands/CommandRegistry';
import { hasNodeGraphComment } from '@/engine/nodes/NodeDecompiler';

type TabId = 'summary' | 'code' | 'nodes';

const TABS: { id: TabId; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'code', label: 'Code' },
  { id: 'nodes', label: 'Nodes' },
];

const PHASE_OPTIONS: Array<{ value: string; label: string; colorClass: string }> = [
  { value: 'pre-rule', label: 'pre', colorClass: 'text-blue-400' },
  { value: 'rule', label: 'rule', colorClass: 'text-red-400' },
  { value: 'post-rule', label: 'post', colorClass: 'text-amber-400' },
];

interface LogicInspectorTabsProps {
  node: SceneNode;
  summaryContent: React.ReactNode;
  code?: string;
  phase?: string;
  codeLang?: string;
  noCodeMessage?: string;
  onCodeChange?: (code: string) => void;
  onPhaseChange?: (phase: string) => void;
  opId?: string;
  hasNodeGraph?: boolean;
  nodeCount?: number;
  edgeCount?: number;
}

export function LogicInspectorTabs({
  node,
  summaryContent,
  code,
  phase,
  codeLang = 'WGSL',
  noCodeMessage,
  onCodeChange,
  onPhaseChange,
  opId,
  hasNodeGraph: hasNodeGraphProp,
  nodeCount,
  edgeCount,
}: LogicInspectorTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [editCode, setEditCode] = useState(code ?? '');
  const [editPhase, setEditPhase] = useState(phase ?? 'post-rule');
  const [dirty, setDirty] = useState(false);

  const codeHasGraph = hasNodeGraphProp || (code ? hasNodeGraphComment(code) : false);

  // Sync from props when code/phase changes externally
  useEffect(() => {
    setEditCode(code ?? '');
    setEditPhase(phase ?? 'post-rule');
    setDirty(false);
  }, [code, phase, node.id]);

  const handleCodeEdit = useCallback((value: string) => {
    setEditCode(value);
    setDirty(true);
  }, []);

  const handlePhaseEdit = useCallback((value: string) => {
    setEditPhase(value);
    setDirty(true);
  }, []);

  const handleApply = useCallback(() => {
    if (editCode !== code) onCodeChange?.(editCode);
    if (editPhase !== phase) onPhaseChange?.(editPhase);
    setDirty(false);
  }, [editCode, editPhase, code, phase, onCodeChange, onPhaseChange]);

  const handleCancel = useCallback(() => {
    setEditCode(code ?? '');
    setEditPhase(phase ?? 'post-rule');
    setDirty(false);
  }, [code, phase]);

  const handleOpenInEditor = useCallback(() => {
    if (opId) {
      commandRegistry.execute('node.openEditor', { tagId: opId });
    }
  }, [opId]);

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

      {/* Summary tab — read-only overview */}
      {activeTab === 'summary' && summaryContent}

      {/* Code tab — full interactive editor */}
      {activeTab === 'code' && (
        <div className="space-y-1.5">
          {code !== undefined ? (
            <>
              {/* Code textarea */}
              <textarea
                className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-800/60 rounded border border-zinc-700/50 p-2 resize-y min-h-[80px] max-h-[300px] focus:outline-none focus:border-green-500/50"
                value={editCode}
                onChange={(e) => handleCodeEdit(e.target.value)}
                spellCheck={false}
                rows={Math.min(15, editCode.split('\n').length + 1)}
              />

              {/* Phase radios + action buttons */}
              <div className="flex items-center gap-2 text-[9px]">
                {PHASE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-0.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`inspector-phase-${node.id}`}
                      checked={editPhase === opt.value}
                      onChange={() => handlePhaseEdit(opt.value)}
                      className="accent-green-400 w-3 h-3"
                    />
                    <span className={opt.colorClass}>{opt.label}</span>
                  </label>
                ))}
                <div className="ml-auto flex gap-1">
                  {opId && (
                    <button
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 border border-cyan-400/30 hover:border-cyan-400/50 rounded px-1.5 py-0.5 cursor-pointer"
                      onClick={handleOpenInEditor}
                    >
                      Nodes
                    </button>
                  )}
                  {dirty && (
                    <>
                      <button
                        onClick={handleApply}
                        className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
                      >
                        Apply
                      </button>
                      <button
                        onClick={handleCancel}
                        className="text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-zinc-500 py-4 text-center">
              {noCodeMessage ?? 'No source code available for this object.'}
            </div>
          )}
        </div>
      )}

      {/* Nodes tab */}
      {activeTab === 'nodes' && (
        <div className="flex flex-col items-center justify-center py-4 px-4 text-center gap-2">
          {codeHasGraph ? (
            <>
              <div className="text-[10px] font-mono text-zinc-400">
                Node graph: {nodeCount ?? '?'} nodes, {edgeCount ?? '?'} edges
              </div>
              <button
                onClick={handleOpenInEditor}
                className="text-[10px] font-mono px-3 py-1.5 rounded bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors cursor-pointer"
              >
                Open in Editor
              </button>
            </>
          ) : (
            <>
              <span className="text-zinc-500 text-[10px]">
                Open in the node editor to create a visual graph.
              </span>
              <button
                onClick={handleOpenInEditor}
                className="text-[10px] font-mono px-3 py-1.5 rounded bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Open in Editor
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
