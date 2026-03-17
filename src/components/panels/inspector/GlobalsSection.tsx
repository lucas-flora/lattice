/**
 * Inspector section for globals nodes.
 * Interactive variable editing: click-to-edit values, add/delete variables.
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { commandRegistry } from '@/commands/CommandRegistry';

interface GlobalsSectionProps {
  node: SceneNode;
}

interface VarDef {
  name: string;
  type: string;
  default: number | string;
}

function VariableAddForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'float' | 'int' | 'string'>('float');

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;
    let parsed: number | string;
    if (type === 'string') {
      parsed = value;
    } else if (type === 'int') {
      parsed = parseInt(value, 10) || 0;
    } else {
      parsed = parseFloat(value) || 0;
    }
    commandRegistry.execute('var.set', { name: name.trim(), value: parsed });
    onClose();
  }, [name, value, type, onClose]);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded p-1.5 space-y-1 mt-0.5" data-testid="globals-var-add-form">
      <div className="flex gap-1 items-center">
        <input
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
          data-testid="globals-var-name-input"
        />
        <input
          className="w-14 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          data-testid="globals-var-value-input"
        />
        <select
          className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-1 py-0.5 outline-none cursor-pointer"
          value={type}
          onChange={(e) => setType(e.target.value as 'float' | 'int' | 'string')}
        >
          <option value="float">float</option>
          <option value="int">int</option>
          <option value="string">string</option>
        </select>
      </div>
      <div className="flex gap-1 items-center">
        <button
          className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
          onClick={handleAdd}
          data-testid="globals-var-add-btn"
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

export const GlobalsSection: React.FC<GlobalsSectionProps> = ({ node }) => {
  const variableDefs = (node.properties.variableDefs ?? []) as VarDef[];
  const variableValues = (node.properties.variableValues ?? {}) as Record<
    string,
    { value: number | string; type: string }
  >;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const allVarNames = [
    ...variableDefs.map((v) => v.name),
    ...Object.keys(variableValues).filter(
      (k) => !variableDefs.some((v) => v.name === k),
    ),
  ];

  const handleEditStart = useCallback((name: string, value: number | string) => {
    setEditingVar(name);
    setEditValue(String(value));
  }, []);

  const handleEditCommit = useCallback((name: string) => {
    const num = Number(editValue);
    const parsed = isNaN(num) ? editValue : num;
    commandRegistry.execute('var.set', { name, value: parsed });
    setEditingVar(null);
  }, [editValue]);

  const handleEditCancel = useCallback(() => {
    setEditingVar(null);
  }, []);

  const handleDelete = useCallback((name: string) => {
    commandRegistry.execute('var.delete', { name });
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-zinc-400 text-[9px] uppercase tracking-wide">
          Variables ({allVarNames.length})
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-zinc-600 hover:text-green-400 text-[11px] cursor-pointer leading-none"
          title="Add variable"
          data-testid="globals-add-variable"
        >
          +
        </button>
      </div>

      {showAddForm && (
        <VariableAddForm onClose={() => setShowAddForm(false)} />
      )}

      {allVarNames.length === 0 && !showAddForm ? (
        <div className="text-zinc-500 text-[11px]">No variables defined</div>
      ) : (
        <div className="space-y-0">
          {allVarNames.map((name) => {
            const def = variableDefs.find((v) => v.name === name);
            const runtime = variableValues[name];
            const value = runtime?.value ?? def?.default ?? 0;
            const type = runtime?.type ?? def?.type ?? 'float';
            const isEditing = editingVar === name;

            return (
              <div
                key={name}
                className="flex items-center justify-between text-[11px] px-0.5 py-0.5 rounded hover:bg-zinc-800/50 group"
              >
                <span className="text-zinc-300 font-mono truncate">{name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] px-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">
                    {type}
                  </span>
                  {isEditing ? (
                    <input
                      className="w-14 bg-zinc-900 text-[11px] text-green-400 rounded px-1 py-0.5 font-mono tabular-nums outline-none focus:ring-1 focus:ring-green-500/50"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditCommit(name);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      onBlur={() => handleEditCommit(name)}
                      autoFocus
                      data-testid={`globals-var-edit-${name}`}
                    />
                  ) : (
                    <span
                      className="text-zinc-400 tabular-nums font-mono cursor-pointer hover:text-green-400"
                      onClick={() => handleEditStart(name, value)}
                      data-testid={`globals-var-value-${name}`}
                    >
                      {typeof value === 'number'
                        ? type === 'int' ? value.toFixed(0) : value.toFixed(3)
                        : String(value)}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(name)}
                    className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[9px]"
                    title={`Delete ${name}`}
                    data-testid={`globals-var-delete-${name}`}
                  >
                    &times;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
