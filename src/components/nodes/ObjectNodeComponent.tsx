/**
 * ObjectNodeComponent: C4D-style object node with input/output property columns.
 *
 * Each property row renders React Flow Handles inline (positioned relative to
 * the row via `position: relative` on the row div). The Handle IS the visual
 * dot — no separate indicator element. Click the property name to toggle;
 * drag the dot to connect.
 *
 * Toggling off removes connected edges.
 */

'use client';

import { memo, useState, useCallback, useContext, useRef } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { PORT_COLORS, CATEGORY_COLORS } from './nodeTheme';
import { NodeSyncContext } from './NodeEditorCanvas';
import type { PortType, ObjectNodeData } from '@/engine/nodes/types';

type ObjectNodeProps = NodeProps & { data: ObjectNodeData & { label: string; nodeType: string } };

const KIND_ICONS: Record<string, string> = {
  'cell-type': '\u25CF',
  'environment': '\u25C6',
  'globals': '\u25A0',
};

export const ObjectNodeComponent = memo(function ObjectNodeComponent({
  id,
  data,
  selected,
}: ObjectNodeProps) {
  const { updateNodeData, setEdges } = useReactFlow();
  const requestSync = useContext(NodeSyncContext);
  const [showAll, setShowAll] = useState(false);
  // Keep a ref to data so toggle callbacks don't recreate on every render
  const dataRef = useRef(data);
  dataRef.current = data;

  const accentColor = CATEGORY_COLORS.object;
  const enabledIn = new Set(data.enabledInputs ?? []);
  const enabledOut = new Set(data.enabledOutputs ?? []);
  const allProps = data.availableProperties ?? [];

  const commonProps = new Set(['alive', 'age', 'alpha', '_cellType']);
  const visibleProps = showAll
    ? allProps
    : allProps.filter((p) => commonProps.has(p.name) || enabledIn.has(p.name) || enabledOut.has(p.name));
  const hiddenCount = allProps.length - visibleProps.length;

  const toggleInput = useCallback(
    (propName: string) => {
      const d = dataRef.current;
      const current = new Set(d.enabledInputs ?? []);
      const removing = current.has(propName);
      if (removing) {
        current.delete(propName);
        const portId = `in_${propName}`;
        setEdges((eds) => eds.filter((e) => !(e.target === id && e.targetHandle === portId)));
      } else {
        current.add(propName);
      }
      updateNodeData(id, { ...d, enabledInputs: Array.from(current) });
      setTimeout(requestSync, 0);
    },
    [id, updateNodeData, setEdges, requestSync],
  );

  const toggleOutput = useCallback(
    (propName: string) => {
      const d = dataRef.current;
      const current = new Set(d.enabledOutputs ?? []);
      const removing = current.has(propName);
      if (removing) {
        current.delete(propName);
        const portId = `out_${propName}`;
        setEdges((eds) => eds.filter((e) => !(e.source === id && e.sourceHandle === portId)));
      } else {
        current.add(propName);
      }
      updateNodeData(id, { ...d, enabledOutputs: Array.from(current) });
      setTimeout(requestSync, 0);
    },
    [id, updateNodeData, setEdges, requestSync],
  );

  return (
    <div
      className={`bg-zinc-800 rounded shadow-lg min-w-[240px] ${
        selected ? 'ring-1 ring-green-500/60' : 'ring-1 ring-zinc-700/50'
      }`}
    >
      {/* Header */}
      <div
        className="px-2.5 py-1 rounded-t text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-900 flex items-center gap-1.5"
        style={{ backgroundColor: accentColor }}
      >
        <span>{KIND_ICONS[data.objectKind] ?? '\u25CF'}</span>
        <span>{data.objectName || 'Object'}</span>
      </div>

      {/* Column labels */}
      <div className="flex items-center px-2 pt-0.5 text-[8px] font-mono uppercase tracking-wider text-zinc-600">
        <span className="flex-1">{'\u25B6'} in</span>
        <span className="flex-1 text-right">out {'\u25B6'}</span>
      </div>

      {/* Property rows */}
      <div className="py-0.5">
        {visibleProps.map((prop) => {
          const isIn = enabledIn.has(prop.name);
          const isOut = enabledOut.has(prop.name);
          const portColor = PORT_COLORS[prop.portType as PortType] ?? PORT_COLORS.scalar;

          return (
            <div
              key={prop.name}
              className="relative flex items-center h-[26px]"
            >
              {/* Input side — click name to toggle */}
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 pl-4 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); toggleInput(prop.name); }}
              >
                <span
                  className={`text-[10px] font-mono truncate ${
                    isIn ? 'text-zinc-200' : 'text-zinc-600'
                  }`}
                >
                  {prop.name}
                </span>
              </button>

              {/* Output side — click name to toggle */}
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 justify-end pr-4 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); toggleOutput(prop.name); }}
              >
                <span
                  className={`text-[10px] font-mono truncate ${
                    isOut ? 'text-zinc-200' : 'text-zinc-600'
                  }`}
                >
                  {prop.name}
                </span>
              </button>

              {/* Left edge: input handle — always rendered for stable registry */}
              <Handle
                type="target"
                position={Position.Left}
                id={`in_${prop.name}`}
                isConnectable={isIn}
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: isIn ? portColor : 'transparent',
                  border: isIn ? '2px solid #27272a' : '1.5px solid #52525b',
                }}
              />

              {/* Right edge: output handle — always rendered for stable registry */}
              <Handle
                type="source"
                position={Position.Right}
                id={`out_${prop.name}`}
                isConnectable={isOut}
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: isOut ? portColor : 'transparent',
                  border: isOut ? '2px solid #27272a' : '1.5px solid #52525b',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Show all toggle */}
      {hiddenCount > 0 && !showAll && (
        <button
          className="w-full text-center text-[9px] font-mono text-zinc-600 hover:text-zinc-400 py-1 border-t border-zinc-700/30 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
        >
          Show all properties ({hiddenCount} more)
        </button>
      )}
      {showAll && allProps.length > 4 && (
        <button
          className="w-full text-center text-[9px] font-mono text-zinc-600 hover:text-zinc-400 py-1 border-t border-zinc-700/30 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); setShowAll(false); }}
        >
          Show less
        </button>
      )}
    </div>
  );
});
