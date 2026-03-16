/**
 * Inspector section for cell-type nodes.
 * Shows name, color, property list.
 */

import React from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';

interface CellTypeSectionProps {
  node: SceneNode;
}

interface CellProp {
  name: string;
  type: string;
  default: number | number[];
  role?: string;
}

export const CellTypeSection: React.FC<CellTypeSectionProps> = ({ node }) => {
  const color = node.properties.color as string | undefined;
  const cellProperties = (node.properties.cellProperties ?? []) as CellProp[];

  return (
    <div className="space-y-2">
      {/* Color */}
      {color && (
        <div className="flex items-center gap-2 text-[11px]">
          <span
            className="w-3 h-3 rounded-sm border border-zinc-600"
            style={{ backgroundColor: color }}
          />
          <span className="text-zinc-400">{color}</span>
        </div>
      )}

      {/* Properties */}
      <div className="text-zinc-400 text-[10px] uppercase tracking-wide">
        Properties ({cellProperties.length})
      </div>
      <div className="space-y-0.5">
        {cellProperties.map((prop) => (
          <div
            key={prop.name}
            className="flex items-center justify-between text-[11px] px-1 py-0.5 rounded hover:bg-zinc-800/50"
          >
            <span className="text-zinc-300">{prop.name}</span>
            <div className="flex items-center gap-1">
              <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-500">
                {prop.type}
              </span>
              <span className="text-zinc-500 tabular-nums text-[10px]">
                {Array.isArray(prop.default) ? prop.default.join(', ') : prop.default}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
