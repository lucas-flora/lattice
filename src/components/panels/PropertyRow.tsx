/**
 * PropertyRow: displays a single cell property with name, type badge, default value,
 * and optional expression tag indicator.
 *
 * When an ExpressionTag writes to this property, shows a `ƒ` badge:
 *   - Green = active tag
 *   - Gray = disabled tag
 * Clicking the badge expands an inline preview of the tag.
 */

'use client';

import { useState, useCallback } from 'react';
import type { CellPropertyType } from '@/engine/cell/types';
import type { ExpressionTag } from '@/engine/expression/types';
import { commandRegistry } from '@/commands/CommandRegistry';

const TYPE_COLORS: Record<CellPropertyType, string> = {
  bool: 'text-blue-400 bg-blue-400/10',
  int: 'text-amber-400 bg-amber-400/10',
  float: 'text-green-400 bg-green-400/10',
  vec2: 'text-purple-400 bg-purple-400/10',
  vec3: 'text-pink-400 bg-pink-400/10',
  vec4: 'text-rose-400 bg-rose-400/10',
};

const SOURCE_LABELS: Record<string, string> = {
  code: 'ƒ',
  link: '⇄',
  script: '⚡',
};

interface PropertyRowProps {
  name: string;
  type: CellPropertyType;
  defaultValue: number | number[];
  role?: string;
  isInherent?: boolean;
  /** ExpressionTag that writes to this property (if any) */
  expression?: ExpressionTag;
}

function formatDefault(value: number | number[], type: CellPropertyType): string {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'int') return String(Math.round(value));
  return String(value);
}

export function PropertyRow({ name, type, defaultValue, role, isInherent, expression }: PropertyRowProps) {
  const colorClass = TYPE_COLORS[type] ?? 'text-zinc-400 bg-zinc-400/10';
  const [expanded, setExpanded] = useState(false);

  const handleToggleEnabled = useCallback(() => {
    if (!expression) return;
    const cmd = expression.enabled ? 'tag.disable' : 'tag.enable';
    commandRegistry.execute(cmd, { id: expression.id });
  }, [expression]);

  return (
    <div data-testid={`property-row-${name}`}>
      <div className="flex items-center gap-2 py-1 group">
        {/* Property name */}
        <span className="text-xs font-mono text-zinc-300 flex-1 truncate">
          {name}
          {isInherent && (
            <span className="text-[8px] font-mono text-zinc-600 ml-1">inherent</span>
          )}
        </span>

        {/* Expression tag indicator */}
        {expression && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-[9px] font-mono px-1 py-0.5 rounded cursor-pointer ${
              expression.enabled
                ? 'text-green-400 bg-green-400/10 hover:bg-green-400/20'
                : 'text-zinc-500 bg-zinc-700 hover:bg-zinc-600'
            }`}
            title={`${expression.name} (${expression.phase})`}
            data-testid="expression-indicator"
          >
            {SOURCE_LABELS[expression.source] ?? 'ƒ'}
          </button>
        )}

        {/* Type badge */}
        <span
          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${colorClass}`}
          title={role ?? 'input_output'}
        >
          {type}
        </span>

        {/* Default value */}
        <span className="text-[10px] font-mono text-zinc-500 tabular-nums w-12 text-right truncate">
          {formatDefault(defaultValue, type)}
        </span>
      </div>

      {/* Expanded tag preview */}
      {expanded && expression && (
        <div className="ml-2 mb-1 px-2 py-1.5 bg-zinc-800/80 rounded border border-zinc-700/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-zinc-400 truncate">
              {expression.name}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] px-1 py-0.5 rounded ${
                expression.phase === 'pre-rule'
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-amber-500/10 text-amber-400'
              }`}>
                {expression.phase}
              </span>
              <button
                onClick={handleToggleEnabled}
                className={`text-[9px] px-1 py-0.5 rounded cursor-pointer ${
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
          <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-all max-h-16 overflow-hidden">
            {expression.code}
          </pre>
        </div>
      )}
    </div>
  );
}
