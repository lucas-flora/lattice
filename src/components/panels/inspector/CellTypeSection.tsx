/**
 * Inspector section for cell-type nodes.
 * Shows name, color, property list using PropertyRow with click-to-edit and add/remove.
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { PropertyRow } from '../PropertyRow';
import { useExpressionStore } from '@/store/expressionStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import type { CellPropertyType } from '@/engine/cell/types';

interface CellTypeSectionProps {
  node: SceneNode;
}

interface CellProp {
  name: string;
  type: CellPropertyType;
  default: number | number[];
  role?: string;
  isInherent?: boolean;
}

function PropertyAddForm({ typeName, onClose }: { typeName: string; onClose: () => void }) {
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
    commandRegistry.execute('cell.addProperty', { type: typeName, name: name.trim(), propType, default: parsed });
    onClose();
  }, [name, propType, defaultVal, typeName, onClose]);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded p-1.5 space-y-1 mt-0.5" data-testid="inspector-property-add-form">
      <div className="flex gap-1 items-center">
        <input
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
          data-testid="inspector-prop-name-input"
        />
        <select
          className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-1 py-0.5 outline-none cursor-pointer"
          value={propType}
          onChange={(e) => setPropType(e.target.value as 'bool' | 'int' | 'float')}
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
        />
      </div>
      <div className="flex gap-1 items-center">
        <button
          className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
          onClick={handleAdd}
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

export const CellTypeSection: React.FC<CellTypeSectionProps> = ({ node }) => {
  const color = node.properties.color as string | undefined;
  const cellProperties = (node.properties.cellProperties ?? []) as CellProp[];
  const cellTypeName = (node.properties.cellTypeId as string) ?? node.name;
  const tags = useExpressionStore((s) => s.tags);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleRemoveProperty = useCallback((propName: string) => {
    commandRegistry.execute('cell.removeProperty', { type: cellTypeName, name: propName });
  }, [cellTypeName]);

  return (
    <div className="space-y-1">
      {/* Color */}
      {color && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className="w-2.5 h-2.5 rounded-sm border border-zinc-600"
            style={{ backgroundColor: color }}
          />
          <span className="text-zinc-400 font-mono">{color}</span>
        </div>
      )}

      {/* Properties */}
      <div className="flex items-center justify-between">
        <div className="text-zinc-400 text-[9px] uppercase tracking-wide">
          Properties ({cellProperties.length})
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-zinc-600 hover:text-green-400 text-[11px] cursor-pointer leading-none"
          title="Add property"
          data-testid="inspector-cell-add-property"
        >
          +
        </button>
      </div>

      {showAddForm && (
        <PropertyAddForm typeName={cellTypeName} onClose={() => setShowAddForm(false)} />
      )}

      <div className="space-y-0">
        {cellProperties.map((prop) => {
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
                  cellTypeName={cellTypeName}
                />
              </div>
              {!prop.isInherent && (
                <button
                  onClick={() => handleRemoveProperty(prop.name)}
                  className="text-zinc-700 hover:text-red-400 opacity-0 group-hover/prop:opacity-100 cursor-pointer transition-opacity text-[9px] ml-0.5 shrink-0"
                  title={`Remove ${prop.name}`}
                  data-testid={`inspector-prop-remove-${prop.name}`}
                >
                  &times;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
