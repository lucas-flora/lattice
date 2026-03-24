/**
 * PropertyRow: displays a single cell property with name, type badge, default value,
 * and optional operator indicator.
 *
 * When an Operator writes to this property, shows a `f` badge:
 *   - Green = active op
 *   - Gray = disabled op
 * Clicking the badge expands an inline editor for the op.
 *
 * When no op exists, shows a `+` button on hover to create one inline.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CellPropertyType } from '@/engine/cell/types';
import type { Operator } from '@/engine/expression/types';
import { commandRegistry } from '@/commands/CommandRegistry';
import { OpAddForm } from './OpAddForm';

const TYPE_COLORS: Record<CellPropertyType, string> = {
  bool: 'text-blue-400 bg-blue-400/10',
  int: 'text-amber-400 bg-amber-400/10',
  float: 'text-green-400 bg-green-400/10',
  vec2: 'text-purple-400 bg-purple-400/10',
  vec3: 'text-pink-400 bg-pink-400/10',
  vec4: 'text-rose-400 bg-rose-400/10',
};

const SOURCE_LABELS: Record<string, string> = {
  code: '\u0192',
  link: '\u21C4',
  script: '\u26A1',
};

interface PropertyRowProps {
  name: string;
  type: CellPropertyType;
  defaultValue: number | number[];
  role?: string;
  isInherent?: boolean;
  /** Operator that writes to this property (if any) */
  expression?: Operator;
  /** Cell type name for op creation (sets owner) */
  cellTypeName?: string;
}

function formatDefault(value: number | number[], type: CellPropertyType): string {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'int') return String(Math.round(value));
  return String(value);
}

function parseDefaultValue(raw: string, propType: CellPropertyType): number | number[] {
  if (propType === 'bool') return raw === 'true' || raw === '1' ? 1 : 0;
  if (propType === 'int') return parseInt(raw, 10) || 0;
  if (propType === 'float') return parseFloat(raw) || 0;
  // vec types: try parsing as comma-separated
  if (raw.startsWith('[')) raw = raw.slice(1, -1);
  const parts = raw.split(',').map((s) => parseFloat(s.trim()) || 0);
  return parts;
}

export function PropertyRow({ name, type, defaultValue, role, isInherent, expression, cellTypeName }: PropertyRowProps) {
  const colorClass = TYPE_COLORS[type] ?? 'text-zinc-400 bg-zinc-400/10';
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editCode, setEditCode] = useState('');
  const [dirty, setDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Click-to-edit default value state
  const [editingDefault, setEditingDefault] = useState(false);
  const [editDefaultValue, setEditDefaultValue] = useState('');

  // Sync editCode when expression changes or expand
  useEffect(() => {
    if (expression && expanded) {
      setEditCode(expression.code);
      setDirty(false);
    }
  }, [expression?.code, expression?.id, expanded]);

  const handleToggleEnabled = useCallback(() => {
    if (!expression) return;
    const cmd = expression.enabled ? 'op.disable' : 'op.enable';
    commandRegistry.execute(cmd, { id: expression.id });
  }, [expression]);

  const handleSave = useCallback(() => {
    if (!expression || !dirty) return;
    commandRegistry.execute('op.edit', { id: expression.id, code: editCode });
    setDirty(false);
  }, [expression, editCode, dirty]);

  const handleDelete = useCallback(() => {
    if (!expression) return;
    commandRegistry.execute('op.remove', { id: expression.id });
    setExpanded(false);
  }, [expression]);

  const handleCodeChange = useCallback((value: string) => {
    setEditCode(value);
    setDirty(true);
  }, []);

  return (
    <div data-testid={`property-row-${name}`}>
      <div className="flex items-center gap-1.5 py-0.5 group">
        {/* Property name */}
        <span className="text-[11px] font-mono text-zinc-300 flex-1 truncate leading-none">
          {name}
          {isInherent && (
            <span className="text-[8px] font-mono text-zinc-600 ml-1">inh</span>
          )}
        </span>

        {/* Operator indicator OR add button */}
        {expression ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-[9px] font-mono px-1 rounded cursor-pointer leading-tight ${
              expression.enabled
                ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20'
                : 'text-zinc-500 bg-zinc-700 hover:bg-zinc-600'
            }`}
            title={`${expression.name} (${expression.phase})`}
            data-testid="expression-indicator"
          >
            {SOURCE_LABELS[expression.source] ?? '\u0192'}
          </button>
        ) : (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-[9px] text-zinc-600 hover:text-green-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
            title="Add op"
            data-testid="property-add-op"
          >
            +
          </button>
        )}

        {/* Type badge */}
        <span
          className={`text-[9px] font-mono px-1 rounded leading-tight ${colorClass}`}
          title={role ?? 'input_output'}
        >
          {type}
        </span>

        {/* Default value — click to edit */}
        {editingDefault ? (
          <input
            className="text-[10px] font-mono text-green-400 bg-zinc-900 tabular-nums w-12 text-right rounded px-0.5 outline-none focus:ring-1 focus:ring-green-500/50"
            value={editDefaultValue}
            onChange={(e) => setEditDefaultValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const parsed = parseDefaultValue(editDefaultValue, type);
                if (cellTypeName) {
                  commandRegistry.execute('cell.setDefault', { type: cellTypeName, property: name, value: parsed });
                }
                setEditingDefault(false);
              }
              if (e.key === 'Escape') setEditingDefault(false);
            }}
            onBlur={() => {
              const parsed = parseDefaultValue(editDefaultValue, type);
              if (cellTypeName) {
                commandRegistry.execute('cell.setDefault', { type: cellTypeName, property: name, value: parsed });
              }
              setEditingDefault(false);
            }}
            autoFocus
            data-testid="property-default-edit"
          />
        ) : (
          <span
            className="text-[10px] font-mono text-zinc-500 tabular-nums w-10 text-right truncate cursor-pointer hover:text-zinc-300"
            onClick={() => {
              setEditDefaultValue(formatDefault(defaultValue, type));
              setEditingDefault(true);
            }}
            data-testid="property-default-display"
          >
            {formatDefault(defaultValue, type)}
          </span>
        )}
      </div>

      {/* Expanded op editor */}
      {expanded && expression && (
        <div className="ml-1 mb-0.5 px-1.5 py-1 bg-zinc-800/80 rounded border border-zinc-700/50">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] font-mono text-zinc-400 truncate">
              {expression.name}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] px-1 rounded ${
                expression.phase === 'pre-rule'
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}>
                {expression.phase}
              </span>
              <button
                onClick={handleToggleEnabled}
                className={`text-[9px] px-1 rounded cursor-pointer ${
                  expression.enabled
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-zinc-700 text-zinc-500'
                }`}
                data-testid="expression-toggle"
              >
                {expression.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={editCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            className="w-full text-[10px] font-mono text-zinc-300 bg-zinc-900/80 border border-zinc-700/50 rounded px-1 py-0.5 resize-y min-h-[32px] max-h-28 focus:outline-none focus:border-green-500/50"
            spellCheck={false}
            rows={Math.min(5, editCode.split('\n').length + 1)}
            data-testid="expression-code-editor"
          />
          <div className="flex items-center justify-between mt-0.5">
            <button
              onClick={handleDelete}
              className="text-[9px] font-mono text-red-400/60 hover:text-red-400 cursor-pointer"
              data-testid="expression-delete"
            >
              Delete
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => commandRegistry.execute('ui.toggleNodeEditor', { tagId: expression.id })}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded text-cyan-400 border border-cyan-400/30 hover:border-cyan-400/50 hover:text-cyan-300 cursor-pointer"
                title="Open in Node Editor"
              >
                Nodes
              </button>
              {dirty && (
                <button
                  onClick={handleSave}
                  className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 cursor-pointer"
                  data-testid="expression-save"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inline op creation form */}
      {showAddForm && !expression && (
        <div className="ml-1 mb-0.5">
          <OpAddForm
            onClose={() => setShowAddForm(false)}
            defaultSource="code"
            defaultTarget={`cell.${name}`}
          />
        </div>
      )}
    </div>
  );
}
