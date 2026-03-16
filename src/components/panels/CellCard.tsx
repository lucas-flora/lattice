/**
 * CellCard: displays a cell type with name, color swatch, and expandable property list.
 *
 * Subscribes to useExpressionStore to find tags that write to each property,
 * passing them to PropertyRow for the `ƒ` indicator display.
 */

'use client';

import { useState } from 'react';
import { PropertyRow } from './PropertyRow';
import { useExpressionStore } from '@/store/expressionStore';
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
  /** Color swatch (CSS color string) */
  color: string;
  /** Properties belonging to this cell type */
  properties: CellPropertyInfo[];
}

export function CellCard({ typeName, color, properties }: CellCardProps) {
  const [expanded, setExpanded] = useState(true);
  const tags = useExpressionStore((s) => s.tags);

  return (
    <div
      className="bg-zinc-800/60 rounded border border-zinc-700/50"
      data-testid="cell-card"
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-700/30 transition-colors"
      >
        {/* Color swatch */}
        <div
          className="w-3 h-3 rounded-sm shrink-0 border border-zinc-600"
          style={{ backgroundColor: color }}
        />

        {/* Type name */}
        <span className="text-xs font-mono text-zinc-200 flex-1 text-left truncate">
          {typeName}
        </span>

        {/* Property count */}
        <span className="text-[9px] font-mono text-zinc-500">
          {properties.length}
        </span>

        {/* Expand chevron */}
        <span className="text-[10px] text-zinc-500">
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </button>

      {/* Property list */}
      {expanded && properties.length > 0 && (
        <div className="px-3 pb-2 border-t border-zinc-700/30">
          {properties.map((prop) => {
            // Find tags that write to this property (cell.propName)
            const propTag = tags.find(
              (t) => t.outputs.some((o) => o === `cell.${prop.name}`),
            );
            return (
              <PropertyRow
                key={prop.name}
                name={prop.name}
                type={prop.type}
                defaultValue={prop.default}
                role={prop.role}
                isInherent={prop.isInherent}
                expression={propTag}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
