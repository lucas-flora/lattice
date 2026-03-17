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

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { layoutStoreActions } from '@/store/layoutStore';
import { getObjectProperties } from '@/engine/nodes/sceneDataResolver';
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

/** Build an initial ObjectNode graph for a property, or return null */
function buildInitGraph(initProperty: string): NodeGraph | null {
  const props = getObjectProperties('cell-type', 'default');
  if (props.length === 0) return null;
  return {
    nodes: [{
      id: '1',
      type: 'ObjectNode',
      position: { x: 0, y: 0 },
      data: {
        objectKind: 'cell-type' as const,
        objectId: 'default',
        objectName: 'Default Cell',
        enabledInputs: [initProperty],
        enabledOutputs: [initProperty],
        availableProperties: props,
      },
    }],
    edges: [],
  };
}

export function NodeEditorPanel({ panelId, config }: PanelProps) {
  ensureNodesRegistered();

  const [selectedTagId, setSelectedTagId] = useState<string | undefined>(
    config?.tagId as string | undefined,
  );

  // Sync when config.tagId is changed externally (e.g. from ui.toggleNodeEditor command)
  useEffect(() => {
    const configTagId = config?.tagId as string | undefined;
    if (configTagId && configTagId !== selectedTagId) {
      setSelectedTagId(configTagId);
    }
  }, [config?.tagId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [graph, setGraph] = useState<NodeGraph>(EMPTY_GRAPH);
  const graphRef = useRef<NodeGraph>(EMPTY_GRAPH);
  const [compiledCode, setCompiledCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'code-edited' | 'code-only'>('code-only');

  // Auto-init: if config.initProperty is set, seed an ObjectNode once
  const initDoneRef = useRef(false);

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
      graphRef.current = tag.nodeGraph;
      setGraph(tag.nodeGraph);
      const result = compileNodeGraph(tag.nodeGraph);
      setCompiledCode(result.code);
      setSyncStatus('synced');
    } else if (tag.code) {
      const recovered = decompileCode(tag.code);
      if (recovered) {
        graphRef.current = recovered;
        setGraph(recovered);
        const result = compileNodeGraph(recovered);
        setCompiledCode(result.code);
        setSyncStatus('synced');
      } else {
        graphRef.current = EMPTY_GRAPH;
        setGraph(EMPTY_GRAPH);
        setCompiledCode(tag.code);
        setSyncStatus('code-only');
      }
    } else if (!initDoneRef.current && config?.initProperty) {
      // Tag is blank (no graph, no code) — seed with an ObjectNode if initProperty is set
      const initGraph = buildInitGraph(config.initProperty as string);
      if (initGraph) {
        initDoneRef.current = true;
        graphRef.current = initGraph;
        setGraph(initGraph);
        setSyncStatus('code-edited');
      }
    }
  }, [selectedTagId, tags]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle graph changes from canvas
  const onGraphChange = useCallback(
    (newGraph: NodeGraph) => {
      graphRef.current = newGraph;
      setGraph(newGraph);
      try {
        const result = compileNodeGraph(newGraph);
        const cleanCode = result.code.split('\n').filter((l) => !l.startsWith('# @nodegraph:')).join('\n');
        setCompiledCode(cleanCode);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('code-edited');
      }
    },
    [],
  );

  // Compile and push to tag — uses graphRef for always-latest data
  const onCompile = useCallback(() => {
    const currentGraph = graphRef.current;
    if (!selectedTagId || currentGraph.nodes.length === 0) return;
    try {
      const result = compileNodeGraph(currentGraph);
      // Strip the @nodegraph comment — the graph is stored separately via nodeGraph field
      const cleanCode = result.code.split('\n').filter((l) => !l.startsWith('# @nodegraph:')).join('\n');
      setCompiledCode(cleanCode);
      commandRegistry.execute('tag.edit', {
        id: selectedTagId,
        code: cleanCode,
        inputs: result.inputs,
        outputs: result.outputs,
        nodeGraph: currentGraph,
      });
      setSyncStatus('synced');
    } catch (e) {
      console.error('Compile error:', e);
    }
  }, [selectedTagId]);

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
    const tagId = id || undefined;
    setSelectedTagId(tagId);
    const tag = tags.find((t) => t.id === tagId);
    const label = tag ? `Nodes: ${tag.name}` : undefined;
    layoutStoreActions.updatePanelConfig(panelId, { tagId, label });
  }, [panelId, tags]);

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
