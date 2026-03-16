/**
 * Inspector section for environment nodes.
 * Interactive parameter sliders with reset.
 */

'use client';

import React from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';

interface EnvironmentSectionProps {
  node: SceneNode;
}

export const EnvironmentSection: React.FC<EnvironmentSectionProps> = ({ node: _node }) => {
  const paramDefs = useSimStore((s) => s.paramDefs);
  const params = useSimStore((s) => s.params);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-zinc-400 text-[10px] uppercase tracking-wide">
          Parameters ({paramDefs.length})
        </div>
        {paramDefs.length > 0 && (
          <button
            onClick={() => commandRegistry.execute('param.reset', {})}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
            data-testid="inspector-param-reset"
          >
            Reset
          </button>
        )}
      </div>
      {paramDefs.length === 0 ? (
        <div className="text-zinc-500 text-[11px]">No parameters defined</div>
      ) : (
        <div className="space-y-2.5">
          {paramDefs.map((def) => {
            const value = params[def.name] ?? def.default;
            return (
              <div key={def.name} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">{def.label ?? def.name}</span>
                  <span className="text-zinc-200 tabular-nums" data-testid={`inspector-param-value-${def.name}`}>
                    {def.type === 'int' ? value : value.toFixed(4)}
                  </span>
                </div>
                <input
                  type="range"
                  min={def.min ?? 0}
                  max={def.max ?? 1}
                  step={def.step ?? (def.type === 'int' ? 1 : 0.001)}
                  value={value}
                  onChange={(e) => {
                    commandRegistry.execute('param.set', {
                      name: def.name,
                      value: parseFloat(e.target.value),
                    });
                  }}
                  className="w-full"
                  data-testid={`inspector-param-slider-${def.name}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
