/**
 * PropertyRow: displays a single cell property with name, type badge, and default value.
 *
 * Phase 2: read-only shell. Expression field and link button are placeholders (disabled).
 * Phase 5 will wire the expression field to the scripting system.
 * Phase 6 will activate the link button for parameter linking.
 */

'use client';

import type { CellPropertyType } from '@/engine/cell/types';

const TYPE_COLORS: Record<CellPropertyType, string> = {
  bool: 'text-blue-400 bg-blue-400/10',
  int: 'text-amber-400 bg-amber-400/10',
  float: 'text-green-400 bg-green-400/10',
  vec2: 'text-purple-400 bg-purple-400/10',
  vec3: 'text-pink-400 bg-pink-400/10',
  vec4: 'text-rose-400 bg-rose-400/10',
};

interface PropertyRowProps {
  name: string;
  type: CellPropertyType;
  defaultValue: number | number[];
  role?: string;
  isInherent?: boolean;
}

function formatDefault(value: number | number[], type: CellPropertyType): string {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'int') return String(Math.round(value));
  return String(value);
}

export function PropertyRow({ name, type, defaultValue, role, isInherent }: PropertyRowProps) {
  const colorClass = TYPE_COLORS[type] ?? 'text-zinc-400 bg-zinc-400/10';

  return (
    <div className="flex items-center gap-2 py-1 group" data-testid={`property-row-${name}`}>
      {/* Property name */}
      <span className="text-xs font-mono text-zinc-300 flex-1 truncate">
        {name}
        {isInherent && (
          <span className="text-[8px] font-mono text-zinc-600 ml-1">inherent</span>
        )}
      </span>

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
  );
}
