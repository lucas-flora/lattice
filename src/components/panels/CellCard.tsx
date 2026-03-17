/**
 * CellCard: displays a cell type with name, color swatch, and expandable property list.
 *
 * Subscribes to useExpressionStore to find tags that write to each property,
 * passing them to PropertyRow for the indicator display.
 */

'use client';

import { useState, useCallback } from 'react';
import { PropertyRow } from './PropertyRow';
import { useExpressionStore } from '@/store/expressionStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import type { CellPropertyType } from '@/engine/cell/types';

export interface CellPropertyInfo {
  name: string;
  type: CellPropertyType;
  default: number | number[];
  role?: string;
  isInherent?: boolean;
}

interface CellCardProps {
  /** Display name for this cell type */
  typeName: string;
  /** Type ID used for commands (registry lookup key) */
  typeId: string;
  /** Color swatch (CSS color string) */
  color: string;
  /** Properties belonging to this cell type */
  properties: CellPropertyInfo[];
}

function PropertyAddForm({ typeId, onClose }: { typeId: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [propType, setPropType] = useState<'bool' | 'int' | 'float'>('float');
  const [defaultVal, setDefaultVal] = useState('');

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;
    const parsed = propType === 'bool'
      ? (defaultVal === 'true' || defaultVal === '1' ? 1 : 0)
      : propType === 'int'
        ? parseInt(defaultVal, 10) || 0
        : parseFloat(defaultVal) || 0;
    commandRegistry.execute('cell.addProperty', { type: typeId, name: name.trim(), propType, default: parsed });
    onClose();
  }, [name, propType, defaultVal, typeId, onClose]);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded p-1.5 space-y-1 mt-0.5" data-testid="property-add-form">
      <div className="flex gap-1 items-center">
        <input
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
          data-testid="prop-name-input"
        />
        <select
          className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-1 py-0.5 outline-none cursor-pointer"
          value={propType}
          onChange={(e) => setPropType(e.target.value as 'bool' | 'int' | 'float')}
          data-testid="prop-type-select"
        >
          <option value="float">float</option>
          <option value="int">int</option>
          <option value="bool">bool</option>
        </select>
        <input
          className="w-10 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="def"
          value={defaultVal}
          onChange={(e) => setDefaultVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          data-testid="prop-default-input"
        />
      </div>
      <div className="flex gap-1 items-center">
        <button
          className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
          onClick={handleAdd}
          data-testid="prop-add-btn"
        >
          Add
        </button>
        <button
          className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer px-1"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CellCard({ typeName, typeId, color, properties }: CellCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const tags = useExpressionStore((s) => s.tags);

  const handleRemoveProperty = useCallback((propName: string) => {
    commandRegistry.execute('cell.removeProperty', { type: typeId, name: propName });
  }, [typeId]);

  return (
    <div
      className="bg-zinc-800/60 rounded border border-zinc-700/50"
      data-testid="cell-card"
    >
      {/* Card header */}
      <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-zinc-700/30 transition-colors">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 flex-1 min-w-0"
        >
          <div
            className="w-2.5 h-2.5 rounded-sm shrink-0 border border-zinc-600"
            style={{ backgroundColor: color }}
          />
          <span className="text-[11px] font-mono text-zinc-200 flex-1 text-left truncate">
            {typeName}
          </span>
          <span className="text-[9px] font-mono text-zinc-500 tabular-nums">
            {properties.length}
          </span>
          <span className="text-[9px] text-zinc-500">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAddForm(!showAddForm); }}
          className="text-zinc-600 hover:text-green-400 text-[11px] cursor-pointer leading-none shrink-0"
          title="Add property"
          data-testid="cell-add-property"
        >
          +
        </button>
      </div>

      {/* Property list */}
      {expanded && (
        <div className="px-2 pb-1 border-t border-zinc-700/30">
          {showAddForm && (
            <PropertyAddForm typeId={typeId} onClose={() => setShowAddForm(false)} />
          )}
          {properties.map((prop) => {
            const propTag = tags.find(
              (t) => t.outputs.some((o) => o === `cell.${prop.name}`),
            );
            return (
              <div key={prop.name} className="flex items-center group/prop">
                <div className="flex-1 min-w-0">
                  <PropertyRow
                    name={prop.name}
                    type={prop.type}
                    defaultValue={prop.default}
                    role={prop.role}
                    isInherent={prop.isInherent}
                    expression={propTag}
                    cellTypeName={typeId}
                  />
                </div>
                {!prop.isInherent && (
                  <button
                    onClick={() => handleRemoveProperty(prop.name)}
                    className="text-zinc-700 hover:text-red-400 opacity-0 group-hover/prop:opacity-100 cursor-pointer transition-opacity text-[9px] ml-0.5 shrink-0"
                    title={`Remove ${prop.name}`}
                    data-testid={`prop-remove-${prop.name}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
