/**
 * NodeEditorCanvas: React Flow wrapper with custom nodes, edges, and add-node menu.
 *
 * Manages the visual graph state and syncs with the underlying NodeGraph data model.
 * Provides NodeSyncContext so child node components (ObjectNodeComponent) can
 * trigger graph sync after data/edge changes.
 */

'use client';

import { createContext, useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  ConnectionMode,
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
import { ObjectNodeComponent } from './ObjectNodeComponent';
import { AddNodeMenu } from './AddNodeMenu';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { getObjectProperties } from '@/engine/nodes/sceneDataResolver';
import type { NodeGraph, NodeInstance, Edge as GraphEdge, PortType, ObjectNodeData } from '@/engine/nodes/types';

/** Context for child node components to trigger graph sync */
export const NodeSyncContext = createContext<() => void>(() => {});

const nodeTypes = { custom: CustomNode, objectNode: ObjectNodeComponent };
const edgeTypes = { custom: CustomEdge };

interface NodeEditorCanvasProps {
  graph: NodeGraph;
  onGraphChange: (graph: NodeGraph) => void;
}

/** Convert engine NodeGraph to React Flow nodes/edges */
function toRFNodes(nodes: NodeInstance[]): Node[] {
  return nodes.map((n) => {
    if (n.type === 'ObjectNode') {
      return {
        id: n.id,
        type: 'objectNode',
        position: n.position,
        data: { label: 'ObjectNode', nodeType: 'ObjectNode', ...n.data },
      };
    }
    return {
      id: n.id,
      type: 'custom',
      position: n.position,
      data: { label: n.type, nodeType: n.type, ...n.data },
    };
  });
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

/** Node context menu state */
interface NodeMenuState {
  nodeId: string;
  x: number;
  y: number;
}

function NodeEditorCanvasInner({ graph, onGraphChange }: NodeEditorCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toRFNodes(graph.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toRFEdges(graph.edges));
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null);
  const reactFlowInstance = useReactFlow();
  const graphRef = useRef(graph);
  const clipboardRef = useRef<{ nodes: Node[]; edges: RFEdge[] } | null>(null);

  // Sync FROM parent: when the graph prop changes externally (e.g. auto-init,
  // tag switch), update the canvas internal state. We compare against graphRef
  // to avoid re-syncing after our own edits (which also update the prop).
  useEffect(() => {
    if (graph !== graphRef.current) {
      graphRef.current = graph;
      setNodes(toRFNodes(graph.nodes));
      setEdges(toRFEdges(graph.edges));
    }
  }, [graph, setNodes, setEdges]);

  // Sync changes back to parent
  const syncGraph = useCallback(
    (newNodes: Node[], newEdges: RFEdge[]) => {
      const ng = toNodeGraph(newNodes, newEdges);
      graphRef.current = ng;
      onGraphChange(ng);
    },
    [onGraphChange],
  );

  // Sync using latest RF state — used by child components via context
  const triggerSync = useCallback(() => {
    const currentNodes = reactFlowInstance.getNodes();
    const currentEdges = reactFlowInstance.getEdges();
    const ng = toNodeGraph(currentNodes, currentEdges);
    graphRef.current = ng;
    onGraphChange(ng);
  }, [reactFlowInstance, onGraphChange]);

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

  // Right-click on pane: add-node menu
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      setNodeMenu(null);
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

  // Right-click on node: node context menu
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setMenuPos(null);
      setNodeMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Node context menu actions
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const remaining = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const remainingEdges = eds.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          );
          syncGraph(remaining, remainingEdges);
          return remainingEdges;
        });
        return remaining;
      });
      setNodeMenu(null);
    },
    [setNodes, setEdges, syncGraph],
  );

  const handleDisconnectNode = useCallback(
    (nodeId: string) => {
      setEdges((eds) => {
        const remaining = eds.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        );
        setNodes((nds) => {
          syncGraph(nds, remaining);
          return nds;
        });
        return remaining;
      });
      setNodeMenu(null);
    },
    [setEdges, setNodes, syncGraph],
  );

  // Add node from menu
  const onAddNode = useCallback(
    (type: string) => {
      if (!menuPos) return;

      const id = String(nextNodeId++);
      let newNode: Node;

      // ObjectNode: type format is "Object:<kind>:<objectId>:<objectName>"
      if (type.startsWith('Object:')) {
        const parts = type.split(':');
        const kind = parts[1] as ObjectNodeData['objectKind'];
        const objectId = parts[2];
        const objectName = parts[3] ?? objectId;
        const props = getObjectProperties(kind, objectId);

        // Pre-enable common properties
        const common = new Set(['alive', 'age', 'alpha']);
        const defaultInputs = props.filter((p) => common.has(p.name)).map((p) => p.name);

        const objData: Record<string, unknown> = {
          label: 'ObjectNode',
          nodeType: 'ObjectNode',
          objectKind: kind,
          objectId,
          objectName,
          enabledInputs: defaultInputs,
          enabledOutputs: [] as string[],
          availableProperties: props,
        };

        newNode = {
          id,
          type: 'objectNode',
          position: menuPos.flowPos,
          data: objData,
        };
      } else {
        const typeDef = nodeTypeRegistry.get(type);
        if (!typeDef) return;

        const defaultData: Record<string, unknown> = {};
        if (type === 'Constant') defaultData.value = 0;
        if (type === 'PropertyRead') defaultData.address = 'cell.alive';
        if (type === 'PropertyWrite') defaultData.address = 'cell.alive';
        if (type === 'Compare') defaultData.operator = '>';

        newNode = {
          id,
          type: 'custom',
          position: menuPos.flowPos,
          data: { label: type, nodeType: type, ...defaultData },
        };
      }

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

  // Keyboard shortcuts: Tab (add menu), Home (fit), Ctrl+C/V (copy/paste)
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

      // Copy selected nodes
      if ((event.metaKey || event.ctrlKey) && event.key === 'c') {
        const selectedNodes = reactFlowInstance.getNodes().filter((n) => n.selected);
        if (selectedNodes.length === 0) return;
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const selectedEdges = reactFlowInstance.getEdges().filter(
          (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
        );
        clipboardRef.current = { nodes: selectedNodes, edges: selectedEdges };
      }

      // Paste copied nodes (offset by 40px)
      if ((event.metaKey || event.ctrlKey) && event.key === 'v') {
        const clip = clipboardRef.current;
        if (!clip || clip.nodes.length === 0) return;
        event.preventDefault();

        const idMap = new Map<string, string>();
        const newNodes: Node[] = clip.nodes.map((n) => {
          const newId = String(nextNodeId++);
          idMap.set(n.id, newId);
          return {
            ...n,
            id: newId,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
            selected: true,
          };
        });
        const newEdges: RFEdge[] = clip.edges.map((e) => ({
          ...e,
          id: `e${Date.now()}_${idMap.get(e.source)}`,
          source: idMap.get(e.source) ?? e.source,
          target: idMap.get(e.target) ?? e.target,
        }));

        // Deselect existing nodes
        setNodes((nds) => {
          const deselected = nds.map((n) => ({ ...n, selected: false }));
          const updated = [...deselected, ...newNodes];
          setEdges((eds) => {
            const allEdges = [...eds, ...newEdges];
            syncGraph(updated, allEdges);
            return allEdges;
          });
          return updated;
        });

        // Update clipboard for subsequent pastes (so they keep offsetting)
        clipboardRef.current = { nodes: newNodes, edges: newEdges };
      }
    },
    [reactFlowInstance, setNodes, setEdges, syncGraph],
  );

  // Resolve port type for ObjectNode dynamic ports
  const resolvePortType = useCallback(
    (node: Node, handleId: string | undefined, direction: 'input' | 'output'): PortType | null => {
      if (!handleId) return null;
      if (node.data.nodeType === 'ObjectNode') {
        const od = node.data as unknown as ObjectNodeData;
        const propName = handleId.replace(/^(in|out)_/, '');
        const prop = od.availableProperties?.find((p: { name: string; portType: PortType }) => p.name === propName);
        return prop?.portType ?? 'scalar';
      }
      const typeDef = nodeTypeRegistry.get(node.data.nodeType as string);
      if (!typeDef) return null;
      const ports = direction === 'output' ? typeDef.outputs : typeDef.inputs;
      const port = ports.find((p) => p.id === handleId);
      return port?.type ?? null;
    },
    [],
  );

  // Validate connections: only same port type can connect
  // Uses reactFlowInstance.getNodes() for fresh data instead of stale `nodes` state
  const isValidConnection = useCallback(
    (connection: RFEdge | Connection) => {
      const currentNodes = reactFlowInstance.getNodes();
      // No self-connections
      if (connection.source === connection.target) return false;

      const sourceNode = currentNodes.find((n) => n.id === connection.source);
      const targetNode = currentNodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return true; // permissive fallback

      const srcHandle = ('sourceHandle' in connection ? connection.sourceHandle : undefined) ?? undefined;
      const tgtHandle = ('targetHandle' in connection ? connection.targetHandle : undefined) ?? undefined;

      // If either handle is missing, allow the connection (React Flow drag to node body)
      if (!srcHandle || !tgtHandle) return true;

      const srcType = resolvePortType(sourceNode, srcHandle, 'output');
      const tgtType = resolvePortType(targetNode, tgtHandle, 'input');
      // If we can't determine type, be permissive
      if (!srcType || !tgtType) return true;

      // Allow compatible connections
      if (srcType === tgtType) return true;
      // Implicit scalar↔array broadcast (numpy)
      if (
        (srcType === 'scalar' && tgtType === 'array') ||
        (srcType === 'array' && tgtType === 'scalar')
      )
        return true;
      // Implicit bool↔scalar (numpy bools are ints: True=1, False=0)
      if (
        (srcType === 'bool' && tgtType === 'scalar') ||
        (srcType === 'scalar' && tgtType === 'bool')
      )
        return true;
      return false;
    },
    [reactFlowInstance, resolvePortType],
  );

  const closeMenus = useCallback(() => {
    setMenuPos(null);
    setNodeMenu(null);
  }, []);

  return (
    <NodeSyncContext.Provider value={triggerSync}>
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
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={closeMenus}
          isValidConnection={isValidConnection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.4 }}
          connectionMode={ConnectionMode.Loose}
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

        {/* Add-node menu (right-click pane) */}
        {menuPos && (
          <AddNodeMenu
            position={{ x: menuPos.x, y: menuPos.y }}
            onSelect={onAddNode}
            onClose={() => setMenuPos(null)}
          />
        )}

        {/* Node context menu (right-click node) */}
        {nodeMenu && (
          <div
            className="fixed z-50 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-md shadow-xl overflow-hidden py-1"
            style={{ left: nodeMenu.x, top: nodeMenu.y, minWidth: 140 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
              onClick={() => handleDisconnectNode(nodeMenu.nodeId)}
            >
              Disconnect All
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs font-mono text-red-400 hover:bg-zinc-800 hover:text-red-300 cursor-pointer"
              onClick={() => handleDeleteNode(nodeMenu.nodeId)}
            >
              Delete Node
            </button>
          </div>
        )}
      </div>
    </NodeSyncContext.Provider>
  );
}

export function NodeEditorCanvas(props: NodeEditorCanvasProps) {
  return (
    <ReactFlowProvider>
      <NodeEditorCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
