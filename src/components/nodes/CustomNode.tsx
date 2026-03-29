/**
 * CustomNode: dark zinc-800 card with colored header bar and typed port handles.
 *
 * Renders in the React Flow canvas as a compact, professional node card.
 * Handles are rendered inline in each port row (position: relative on the row)
 * so they always align with their labels.
 *
 * Inline value editing for Constant, PropertyRead/Write, and Compare nodes.
 * Unconnected input ports show an editable default value field — typing a
 * value and pressing Enter spawns a connected Constant node.
 */

'use client';

import { memo, useCallback, useContext, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { CATEGORY_COLORS, PORT_COLORS } from './nodeTheme';
import { NodeSyncContext } from './NodeEditorCanvas';
import type { PortType, NodeCategory } from '@/engine/nodes/types';

interface NodeData {
  label: string;
  nodeType: string;
  [key: string]: unknown;
}

type CustomNodeProps = NodeProps & { data: NodeData };

/** Text-based number input that avoids spinner-stuck and leading-zero bugs. */
function ConstantInput({ value, onChange, autoFocus }: { value: number; onChange: (v: number) => void; autoFocus?: boolean }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Sync from parent when not focused (external changes)
  const displayValue = focused ? text : String(value);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw);
    const v = Number.isFinite(parsed) ? parsed : 0;
    onChange(v);
    setText(String(v));
  };

  return (
    <div className="px-2.5 pb-0.5">
      <input
        type="text"
        inputMode="decimal"
        className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
        value={displayValue}
        onChange={(e) => { setText(e.target.value); }}
        onBlur={(e) => { setFocused(false); commit(e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); } }}
        onFocus={() => { setFocused(true); setText(String(value)); }}
        onClick={(e) => e.stopPropagation()}
        autoFocus={autoFocus}
      />
    </div>
  );
}

let _spawnId = 10000;

export const CustomNode = memo(function CustomNode({ id, data, selected }: CustomNodeProps) {
  const typeDef = nodeTypeRegistry.get(data.nodeType);
  const { updateNodeData, addNodes, addEdges, getEdges, getNode } = useReactFlow();
  const requestSync = useContext(NodeSyncContext);

  const category = (typeDef?.category ?? 'utility') as NodeCategory;
  const accentColor = CATEGORY_COLORS[category];

  const onDataChange = useCallback(
    (key: string, value: unknown) => {
      updateNodeData(id, { ...data, [key]: value });
      setTimeout(requestSync, 0);
    },
    [id, data, updateNodeData, requestSync],
  );

  // Spawn a Constant node connected to an unconnected input port
  const spawnConstant = useCallback(
    (portId: string, value: number, portIndex: number) => {
      const cId = String(_spawnId++);
      const parentNode = getNode(id);
      const px = parentNode?.position?.x ?? 0;
      const py = parentNode?.position?.y ?? 0;
      // Align vertically with the target port row (header ~28px + row * 22px)
      const yOffset = portIndex * 22;
      const node = {
        id: cId,
        type: 'custom' as const,
        position: { x: px - 200, y: py + yOffset },
        data: { label: 'Constant', nodeType: 'Constant', value, autoFocus: true },
      };
      const edge = {
        id: `e${Date.now()}_${cId}`,
        source: cId,
        sourceHandle: 'value',
        target: id,
        targetHandle: portId,
        type: 'custom',
      };
      addNodes([node]);
      addEdges([edge]);
      setTimeout(requestSync, 0);
    },
    [id, addNodes, addEdges, requestSync, getNode],
  );

  if (!typeDef) {
    return (
      <div className="bg-zinc-800 border border-red-500/50 rounded px-3 py-2 text-xs text-red-400 font-mono">
        Unknown: {data.nodeType}
      </div>
    );
  }

  // Check which input ports have edges connected + find downstream target for header hint
  const connectedInputs = new Set<string>();
  let downstreamHint = '';
  try {
    const edges = getEdges();
    for (const e of edges) {
      if (e.target === id && e.targetHandle) {
        connectedInputs.add(e.targetHandle);
      }
    }
    // For single-output nodes, show where the output goes
    if (typeDef.outputs.length === 1) {
      const outEdges = edges.filter((e) => e.source === id);
      if (outEdges.length === 1) {
        const tgt = getNode(outEdges[0].target);
        if (tgt) {
          const tgtData = tgt.data as NodeData;
          const tgtType = nodeTypeRegistry.get(tgtData.nodeType);
          const portLabel = tgtType?.inputs.find((p) => p.id === outEdges[0].targetHandle)?.label
            ?? outEdges[0].targetHandle ?? '';
          const tgtName = tgtData.objectName as string || tgtType?.label || tgtData.nodeType;
          downstreamHint = `${tgtName} > ${portLabel}`;
        }
      }
    }
  } catch { /* getEdges may fail during init */ }

  return (
    <div
      className={`bg-zinc-800 rounded shadow-lg min-w-[140px] ${
        selected ? 'ring-1 ring-green-500/60' : 'ring-1 ring-zinc-700/50'
      }`}
    >
      {/* Header */}
      <div
        className="px-2.5 py-1 rounded-t text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-900 flex items-center justify-between gap-2"
        style={{ backgroundColor: accentColor }}
      >
        <span>{typeDef.label}</span>
        {downstreamHint && (
          <span className="text-[8px] font-normal normal-case tracking-normal opacity-50 truncate">
            {downstreamHint}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="py-1">
        {/* Inline data editors */}
        {typeDef.hasData && data.nodeType === 'Constant' && (
          <ConstantInput value={data.value as number ?? 0} onChange={(v) => onDataChange('value', v)} autoFocus={!!data.autoFocus} />
        )}
        {typeDef.hasData && (data.nodeType === 'PropertyRead' || data.nodeType === 'PropertyWrite') && (
          <div className="px-2.5 pb-0.5">
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
              value={data.address as string ?? ''}
              onChange={(e) => onDataChange('address', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="cell.property"
            />
          </div>
        )}
        {typeDef.hasData && data.nodeType === 'Compare' && (
          <div className="px-2.5 pb-0.5">
            <select
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none"
              value={data.operator as string ?? '>'}
              onChange={(e) => onDataChange('operator', e.target.value)}
              onClick={(e) => e.stopPropagation()}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value="==">==</option>
              <option value="!=">!=</option>
            </select>
          </div>
        )}
        {typeDef.hasData && data.nodeType === 'NeighborRead' && (
          <div className="px-2.5 pb-0.5 space-y-0.5">
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
              value={data.property as string ?? 'alive'}
              onChange={(e) => onDataChange('property', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="property"
            />
            <div className="flex gap-1 text-[9px] font-mono text-zinc-500">
              <span className="flex items-center gap-0.5">dx<input
                type="text"
                inputMode="numeric"
                className="w-8 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
                defaultValue={data.dx as number ?? 0}
                onBlur={(e) => onDataChange('dx', parseInt(e.target.value) || 0)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onClick={(e) => e.stopPropagation()}
              /></span>
              <span className="flex items-center gap-0.5">dy<input
                type="text"
                inputMode="numeric"
                className="w-8 bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
                defaultValue={data.dy as number ?? 0}
                onBlur={(e) => onDataChange('dy', parseInt(e.target.value) || 0)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onClick={(e) => e.stopPropagation()}
              /></span>
            </div>
          </div>
        )}
        {typeDef.hasData && data.nodeType === 'NeighborSum' && (
          <div className="px-2.5 pb-0.5">
            <input
              type="text"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
              value={data.property as string ?? 'alive'}
              onChange={(e) => onDataChange('property', e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder="property"
            />
          </div>
        )}
        {typeDef.hasData && data.nodeType === 'CodeBlock' && (
          <div className="px-2 pb-1">
            <div
              className="w-full max-w-[200px] bg-zinc-950 border border-dashed border-amber-600/40 rounded px-1.5 py-1 text-[9px] font-mono text-amber-400/80 whitespace-pre-wrap break-all leading-tight max-h-[60px] overflow-hidden"
              title={data.code as string ?? ''}
            >
              {(data.code as string ?? '').slice(0, 120)}{(data.code as string ?? '').length > 120 ? '...' : ''}
            </div>
          </div>
        )}

        {/* Input port rows — each row has position:relative so Handle aligns */}
        {typeDef.inputs.map((port, portIndex) => (
          <div key={`in-${port.id}`} className="relative flex items-center h-[22px]">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              style={{
                width: 8,
                height: 8,
                backgroundColor: PORT_COLORS[port.type as PortType],
                border: '2px solid #27272a',
              }}
            />
            <span className="text-[10px] font-mono text-zinc-500 pl-3 flex-1">
              {port.label}
            </span>
            {/* Click default value to spawn a wired Constant node */}
            {!connectedInputs.has(port.id) && (port.type === 'scalar' || port.type === 'array') && (
              <button
                className="text-[9px] font-mono text-zinc-700 hover:text-zinc-500 pr-2 cursor-pointer tabular-nums"
                onClick={(e) => { e.stopPropagation(); spawnConstant(port.id, (port.defaultValue as number) ?? 0, portIndex); }}
                title="Add value node"
              >
                {(port.defaultValue as number) ?? 0}
              </button>
            )}
          </div>
        ))}

        {/* Output port rows */}
        {typeDef.outputs.map((port) => (
          <div key={`out-${port.id}`} className="relative flex items-center h-[22px]">
            <span className="text-[10px] font-mono text-zinc-500 text-right pr-3 flex-1">
              {port.label}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              style={{
                width: 8,
                height: 8,
                backgroundColor: PORT_COLORS[port.type as PortType],
                border: '2px solid #27272a',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
});

