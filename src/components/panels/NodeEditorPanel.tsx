/**
 * NodeEditorPanel: visual node editor for ExpressionTag code.
 *
 * Registered as 'nodeEditor' in PanelRegistry. Config can carry `tagId`
 * to focus on a specific ExpressionTag's node graph.
 *
 * Features:
 * - React Flow canvas with custom nodes/edges
 * - Add-node menu (right-click or Tab)
 * - Toolbar with compile, layout, fit, tag selector
 * - Optional code preview side panel
 */

'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { PanelProps } from '@/layout/types';
import { NodeEditorCanvas } from '@/components/nodes/NodeEditorCanvas';
import { NodeEditorToolbar } from '@/components/nodes/NodeEditorToolbar';
import { CodePreview } from '@/components/nodes/CodePreview';
import { compileNodeGraph } from '@/engine/nodes/NodeCompiler';
import { decompileCode } from '@/engine/nodes/NodeDecompiler';
import { registerBuiltinNodes } from '@/engine/nodes/builtinNodes';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { useExpressionStore } from '@/store/expressionStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import type { NodeGraph } from '@/engine/nodes/types';

// Register builtin nodes once
let nodesRegistered = false;
function ensureNodesRegistered() {
  if (!nodesRegistered && nodeTypeRegistry.getAll().length === 0) {
    registerBuiltinNodes();
    nodesRegistered = true;
  }
}

const EMPTY_GRAPH: NodeGraph = { nodes: [], edges: [] };

export function NodeEditorPanel({ config }: PanelProps) {
  ensureNodesRegistered();

  const [selectedTagId, setSelectedTagId] = useState<string | undefined>(
    config?.tagId as string | undefined,
  );
  const [graph, setGraph] = useState<NodeGraph>(EMPTY_GRAPH);
  const [compiledCode, setCompiledCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'code-edited' | 'code-only'>('code-only');

  // Get all tags for the selector
  const tags = useExpressionStore((s) => s.tags);
  const tagOptions = useMemo(
    () => tags.map((t) => ({ id: t.id, name: t.name })),
    [tags],
  );

  // Load graph from selected tag
  useEffect(() => {
    if (!selectedTagId) {
      setGraph(EMPTY_GRAPH);
      setCompiledCode('');
      setSyncStatus('code-only');
      return;
    }

    const tag = tags.find((t) => t.id === selectedTagId);
    if (!tag) return;

    if (tag.nodeGraph) {
      setGraph(tag.nodeGraph);
      const result = compileNodeGraph(tag.nodeGraph);
      setCompiledCode(result.code);
      setSyncStatus('synced');
    } else if (tag.code) {
      const recovered = decompileCode(tag.code);
      if (recovered) {
        setGraph(recovered);
        const result = compileNodeGraph(recovered);
        setCompiledCode(result.code);
        setSyncStatus('synced');
      } else {
        setGraph(EMPTY_GRAPH);
        setCompiledCode(tag.code);
        setSyncStatus('code-only');
      }
    }
  }, [selectedTagId, tags]);

  // Handle graph changes from canvas
  const onGraphChange = useCallback(
    (newGraph: NodeGraph) => {
      setGraph(newGraph);
      try {
        const result = compileNodeGraph(newGraph);
        setCompiledCode(result.code);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('code-edited');
      }
    },
    [],
  );

  // Compile and push to tag
  const onCompile = useCallback(() => {
    if (!selectedTagId || graph.nodes.length === 0) return;
    try {
      const result = compileNodeGraph(graph);
      setCompiledCode(result.code);
      commandRegistry.execute('tag.edit', {
        id: selectedTagId,
        code: result.code,
        inputs: result.inputs,
        outputs: result.outputs,
        nodeGraph: graph,
      });
      setSyncStatus('synced');
    } catch (e) {
      console.error('Compile error:', e);
    }
  }, [selectedTagId, graph]);

  // Auto-layout (simple left-to-right placement)
  const onAutoLayout = useCallback(() => {
    if (graph.nodes.length === 0) return;

    // Simple layered layout: group by depth from sources
    const depths = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) {
      adj.set(n.id, []);
      depths.set(n.id, 0);
    }
    for (const e of graph.edges) {
      adj.get(e.source)?.push(e.target);
    }

    // BFS to find depths
    const sources = graph.nodes
      .filter((n) => !graph.edges.some((e) => e.target === n.id))
      .map((n) => n.id);
    const queue = sources.map((id) => ({ id, depth: 0 }));
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth > (depths.get(id) ?? 0)) {
        depths.set(id, depth);
      }
      for (const next of adj.get(id) ?? []) {
        queue.push({ id: next, depth: depth + 1 });
      }
    }

    // Position by depth
    const layerCounts = new Map<number, number>();
    const newNodes = graph.nodes.map((n) => {
      const d = depths.get(n.id) ?? 0;
      const row = layerCounts.get(d) ?? 0;
      layerCounts.set(d, row + 1);
      return { ...n, position: { x: d * 220, y: row * 100 } };
    });

    const newGraph = { nodes: newNodes, edges: graph.edges };
    onGraphChange(newGraph);
  }, [graph, onGraphChange]);

  const onFitView = useCallback(() => {
    // React Flow's fitView is handled internally via the Controls component
    // We trigger a re-render that lets the canvas know to fitView
  }, []);

  const onTagChange = useCallback((id: string) => {
    setSelectedTagId(id || undefined);
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-zinc-950 text-zinc-300">
      <NodeEditorToolbar
        tagId={selectedTagId}
        tagOptions={tagOptions}
        onTagChange={onTagChange}
        onCompile={onCompile}
        onAutoLayout={onAutoLayout}
        onFitView={onFitView}
        showCode={showCode}
        onToggleCode={() => setShowCode((s) => !s)}
        syncStatus={syncStatus}
      />

      <div className="flex-1 min-h-0 flex">
        {/* Canvas */}
        <div className={`${showCode ? 'w-2/3' : 'w-full'} h-full`}>
          <NodeEditorCanvas graph={graph} onGraphChange={onGraphChange} />
        </div>

        {/* Code preview */}
        {showCode && (
          <div className="w-1/3 h-full border-l border-zinc-800">
            <CodePreview code={compiledCode} />
          </div>
        )}
      </div>
    </div>
  );
}
