/**
 * CustomNode: dark zinc-800 card with colored header bar and typed port handles.
 *
 * Renders in the React Flow canvas as a compact, professional node card.
 * Inline value editing for Constant and PropertyRead/Write nodes.
 */

'use client';

import { memo, useCallback } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { CATEGORY_COLORS, PORT_COLORS } from './nodeTheme';
import type { PortType, NodeCategory } from '@/engine/nodes/types';

interface NodeData {
  label: string;
  nodeType: string;
  [key: string]: unknown;
}

type CustomNodeProps = NodeProps & { data: NodeData };

export const CustomNode = memo(function CustomNode({ id, data, selected }: CustomNodeProps) {
  const typeDef = nodeTypeRegistry.get(data.nodeType);
  const { updateNodeData } = useReactFlow();

  const category = (typeDef?.category ?? 'utility') as NodeCategory;
  const accentColor = CATEGORY_COLORS[category];

  const onDataChange = useCallback(
    (key: string, value: unknown) => {
      updateNodeData(id, { ...data, [key]: value });
    },
    [id, data, updateNodeData],
  );

  if (!typeDef) {
    return (
      <div className="bg-zinc-800 border border-red-500/50 rounded px-3 py-2 text-xs text-red-400 font-mono">
        Unknown: {data.nodeType}
      </div>
    );
  }

  return (
    <div
      className={`bg-zinc-800 rounded shadow-lg min-w-[140px] ${
        selected ? 'ring-1 ring-green-500/60' : 'ring-1 ring-zinc-700/50'
      }`}
    >
      {/* Header */}
      <div
        className="px-2.5 py-1 rounded-t text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-900"
        style={{ backgroundColor: accentColor }}
      >
        {typeDef.label}
      </div>

      {/* Body */}
      <div className="px-2.5 py-1.5 space-y-1">
        {/* Inline data editors */}
        {typeDef.hasData && data.nodeType === 'Constant' && (
          <input
            type="number"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
            value={data.value as number ?? 0}
            onChange={(e) => onDataChange('value', parseFloat(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
        {typeDef.hasData && (data.nodeType === 'PropertyRead' || data.nodeType === 'PropertyWrite') && (
          <input
            type="text"
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
            value={data.address as string ?? ''}
            onChange={(e) => onDataChange('address', e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="cell.property"
          />
        )}
        {typeDef.hasData && data.nodeType === 'Compare' && (
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
        )}

        {/* Port labels */}
        {typeDef.inputs.length > 0 && (
          <div className="space-y-0.5">
            {typeDef.inputs.map((port) => (
              <div key={port.id} className="text-[10px] font-mono text-zinc-500 pl-2">
                {port.label}
              </div>
            ))}
          </div>
        )}
        {typeDef.outputs.length > 0 && (
          <div className="space-y-0.5">
            {typeDef.outputs.map((port) => (
              <div key={port.id} className="text-[10px] font-mono text-zinc-500 text-right pr-2">
                {port.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input handles */}
      {typeDef.inputs.map((port, i) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            top: `${50 + i * 18}%`,
            width: 8,
            height: 8,
            backgroundColor: PORT_COLORS[port.type as PortType],
            border: '2px solid #27272a',
          }}
        />
      ))}

      {/* Output handles */}
      {typeDef.outputs.map((port, i) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            top: `${50 + i * 18}%`,
            width: 8,
            height: 8,
            backgroundColor: PORT_COLORS[port.type as PortType],
            border: '2px solid #27272a',
          }}
        />
      ))}
    </div>
  );
});
