/**
 * NodeEditorCanvas: React Flow wrapper with custom nodes, edges, and add-node menu.
 *
 * Manages the visual graph state and syncs with the underlying NodeGraph data model.
 */

'use client';

import { useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
  type Edge as RFEdge,
  type OnConnect,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { AddNodeMenu } from './AddNodeMenu';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { PORT_COLORS } from './nodeTheme';
import type { NodeGraph, NodeInstance, Edge as GraphEdge, PortType } from '@/engine/nodes/types';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

interface NodeEditorCanvasProps {
  graph: NodeGraph;
  onGraphChange: (graph: NodeGraph) => void;
}

/** Convert engine NodeGraph to React Flow nodes/edges */
function toRFNodes(nodes: NodeInstance[]): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: 'custom',
    position: n.position,
    data: { label: n.type, nodeType: n.type, ...n.data },
  }));
}

function toRFEdges(edges: GraphEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourcePort,
    target: e.target,
    targetHandle: e.targetPort,
    type: 'custom',
  }));
}

/** Convert React Flow state back to engine NodeGraph */
function toNodeGraph(rfNodes: Node[], rfEdges: RFEdge[]): NodeGraph {
  return {
    nodes: rfNodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType as string,
      position: { x: n.position.x, y: n.position.y },
      data: extractData(n.data as Record<string, unknown>),
    })),
    edges: rfEdges.map((e) => ({
      id: e.id,
      source: e.source,
      sourcePort: e.sourceHandle ?? 'value',
      target: e.target,
      targetPort: e.targetHandle ?? 'value',
    })),
  };
}

function extractData(data: Record<string, unknown>): Record<string, unknown> {
  const { label, nodeType, ...rest } = data;
  return rest;
}

let nextNodeId = 100;

function NodeEditorCanvasInner({ graph, onGraphChange }: NodeEditorCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(graph.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(graph.edges));
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null);
  const reactFlowInstance = useReactFlow();
  const graphRef = useRef(graph);

  // Sync changes back to parent
  const syncGraph = useCallback(
    (newNodes: Node[], newEdges: RFEdge[]) => {
      const ng = toNodeGraph(newNodes, newEdges);
      graphRef.current = ng;
      onGraphChange(ng);
    },
    [onGraphChange],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge(
          { ...connection, type: 'custom', id: `e${Date.now()}` },
          eds,
        );
        // Defer sync to avoid stale nodes
        setTimeout(() => {
          setNodes((nds) => {
            syncGraph(nds, newEdges);
            return nds;
          });
        }, 0);
        return newEdges;
      });
    },
    [setEdges, setNodes, syncGraph],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const deletedIds = new Set(deleted.map((n) => n.id));
      setNodes((nds) => {
        const remaining = nds.filter((n) => !deletedIds.has(n.id));
        setEdges((eds) => {
          const remainingEdges = eds.filter(
            (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
          );
          syncGraph(remaining, remainingEdges);
          return remainingEdges;
        });
        return remaining;
      });
    },
    [setNodes, setEdges, syncGraph],
  );

  const onEdgesDelete = useCallback(
    (deleted: RFEdge[]) => {
      const deletedIds = new Set(deleted.map((e) => e.id));
      setEdges((eds) => {
        const remaining = eds.filter((e) => !deletedIds.has(e.id));
        setNodes((nds) => {
          syncGraph(nds, remaining);
          return nds;
        });
        return remaining;
      });
    },
    [setEdges, setNodes, syncGraph],
  );

  const onNodeDragStop = useCallback(() => {
    setNodes((nds) => {
      setEdges((eds) => {
        syncGraph(nds, eds);
        return eds;
      });
      return nds;
    });
  }, [setNodes, setEdges, syncGraph]);

  // Right-click to open add-node menu
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;
      const flowPos = reactFlowInstance.screenToFlowPosition({
        x: clientX,
        y: clientY,
      });
      setMenuPos({ x: clientX, y: clientY, flowPos });
    },
    [reactFlowInstance],
  );

  // Add node from menu
  const onAddNode = useCallback(
    (type: string) => {
      if (!menuPos) return;
      const typeDef = nodeTypeRegistry.get(type);
      if (!typeDef) return;

      const id = String(nextNodeId++);
      const defaultData: Record<string, unknown> = {};
      if (type === 'Constant') defaultData.value = 0;
      if (type === 'PropertyRead') defaultData.address = 'cell.alive';
      if (type === 'PropertyWrite') defaultData.address = 'cell.alive';
      if (type === 'Compare') defaultData.operator = '>';

      const newNode: Node = {
        id,
        type: 'custom',
        position: menuPos.flowPos,
        data: { label: type, nodeType: type, ...defaultData },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        setEdges((eds) => {
          syncGraph(updated, eds);
          return eds;
        });
        return updated;
      });
      setMenuPos(null);
    },
    [menuPos, setNodes, setEdges, syncGraph],
  );

  // Tab key to open add menu at center
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        const center = reactFlowInstance.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        setMenuPos({
          x: window.innerWidth / 2 - 110,
          y: window.innerHeight / 2 - 170,
          flowPos: center,
        });
      }
      if (event.key === 'h' || event.key === 'Home') {
        reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
      }
    },
    [reactFlowInstance],
  );

  // Validate connections: only same port type can connect
  const isValidConnection = useCallback(
    (connection: RFEdge | Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return false;

      const sourceType = nodeTypeRegistry.get(sourceNode.data.nodeType as string);
      const targetType = nodeTypeRegistry.get(targetNode.data.nodeType as string);
      if (!sourceType || !targetType) return false;

      const srcHandle = 'sourceHandle' in connection ? connection.sourceHandle : undefined;
      const tgtHandle = 'targetHandle' in connection ? connection.targetHandle : undefined;
      const sourcePort = sourceType.outputs.find((p) => p.id === srcHandle);
      const targetPort = targetType.inputs.find((p) => p.id === tgtHandle);
      if (!sourcePort || !targetPort) return false;

      // Allow scalar→array and array→scalar connections (implicit broadcast)
      if (sourcePort.type === targetPort.type) return true;
      if (
        (sourcePort.type === 'scalar' && targetPort.type === 'array') ||
        (sourcePort.type === 'array' && targetPort.type === 'scalar')
      )
        return true;
      return false;
    },
    [nodes],
  );

  return (
    <div className="w-full h-full" onKeyDown={onKeyDown} tabIndex={0}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => setMenuPos(null)}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode="dark"
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#3f3f46"
        />
        <MiniMap
          nodeColor="#4ade80"
          maskColor="rgba(0,0,0,0.7)"
          style={{
            backgroundColor: '#18181b',
            borderRadius: 4,
          }}
        />
        <Controls
          showInteractive={false}
          style={{
            backgroundColor: '#27272a',
            borderRadius: 4,
            border: '1px solid #3f3f46',
          }}
        />
      </ReactFlow>

      {menuPos && (
        <AddNodeMenu
          position={{ x: menuPos.x, y: menuPos.y }}
          onSelect={onAddNode}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  );
}

export function NodeEditorCanvas(props: NodeEditorCanvasProps) {
  return (
    <ReactFlowProvider>
      <NodeEditorCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
