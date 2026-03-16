/**
 * Inspector section for globals nodes.
 * Shows variable definitions and values.
 */

import React from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';

interface GlobalsSectionProps {
  node: SceneNode;
}

interface VarDef {
  name: string;
  type: string;
  default: number | string;
}

export const GlobalsSection: React.FC<GlobalsSectionProps> = ({ node }) => {
  const variableDefs = (node.properties.variableDefs ?? []) as VarDef[];
  const variableValues = (node.properties.variableValues ?? {}) as Record<
    string,
    { value: number | string; type: string }
  >;

  return (
    <div className="space-y-2">
      <div className="text-zinc-400 text-[10px] uppercase tracking-wide">
        Variables ({variableDefs.length + Object.keys(variableValues).length})
      </div>
      {variableDefs.length === 0 && Object.keys(variableValues).length === 0 ? (
        <div className="text-zinc-500 text-[11px]">No variables defined</div>
      ) : (
        <div className="space-y-0.5">
          {variableDefs.map((v) => (
            <div
              key={v.name}
              className="flex items-center justify-between text-[11px] px-1 py-0.5 rounded hover:bg-zinc-800/50"
            >
              <span className="text-zinc-300">{v.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-500">
                  {v.type}
                </span>
                <span className="text-zinc-400 tabular-nums">
                  {variableValues[v.name]?.value ?? v.default}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
