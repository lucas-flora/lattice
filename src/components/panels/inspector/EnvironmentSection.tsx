/**
 * Inspector section for environment nodes.
 * Interactive parameter sliders with reset, add, and remove.
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { SceneNode } from '../../../engine/scene/SceneNode';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ParamSlider } from '../ParamSlider';

interface EnvironmentSectionProps {
  node: SceneNode;
}

function ParamAddForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'float' | 'int'>('float');
  const [defaultVal, setDefaultVal] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [step, setStep] = useState('');

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;
    const def = type === 'int' ? parseInt(defaultVal, 10) || 0 : parseFloat(defaultVal) || 0;
    const minN = min ? parseFloat(min) : undefined;
    const maxN = max ? parseFloat(max) : undefined;
    const stepN = step ? parseFloat(step) : undefined;
    commandRegistry.execute('param.add', {
      name: name.trim(),
      type,
      default: def,
      min: minN !== undefined && !isNaN(minN) ? minN : undefined,
      max: maxN !== undefined && !isNaN(maxN) ? maxN : undefined,
      step: stepN !== undefined && !isNaN(stepN) ? stepN : undefined,
    });
    onClose();
  }, [name, type, defaultVal, min, max, step, onClose]);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded p-1.5 space-y-1 mt-0.5" data-testid="param-add-form">
      <div className="flex gap-1 items-center">
        <input
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
          data-testid="param-name-input"
        />
        <select
          className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-1 py-0.5 outline-none cursor-pointer"
          value={type}
          onChange={(e) => setType(e.target.value as 'float' | 'int')}
          data-testid="param-type-select"
        >
          <option value="float">float</option>
          <option value="int">int</option>
        </select>
      </div>
      <div className="flex gap-1">
        <input
          className="w-1/4 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="default"
          value={defaultVal}
          onChange={(e) => setDefaultVal(e.target.value)}
          data-testid="param-default-input"
        />
        <input
          className="w-1/4 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="min"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          data-testid="param-min-input"
        />
        <input
          className="w-1/4 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="max"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          data-testid="param-max-input"
        />
        <input
          className="w-1/4 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="step"
          value={step}
          onChange={(e) => setStep(e.target.value)}
          data-testid="param-step-input"
        />
      </div>
      <div className="flex gap-1 items-center">
        <button
          className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
          onClick={handleAdd}
          data-testid="param-add-btn"
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

export const EnvironmentSection: React.FC<EnvironmentSectionProps> = ({ node: _node }) => {
  const paramDefs = useSimStore((s) => s.paramDefs);
  const params = useSimStore((s) => s.params);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-zinc-400 text-[9px] uppercase tracking-wide">
          Parameters ({paramDefs.length})
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-zinc-600 hover:text-green-400 text-[11px] cursor-pointer leading-none"
            title="Add parameter"
            data-testid="inspector-param-add"
          >
            +
          </button>
          {paramDefs.length > 0 && (
            <button
              onClick={() => commandRegistry.execute('param.reset', {})}
              className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              data-testid="inspector-param-reset"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {showAddForm && (
        <ParamAddForm onClose={() => setShowAddForm(false)} />
      )}

      {paramDefs.length === 0 && !showAddForm ? (
        <div className="text-zinc-500 text-[11px]">No parameters defined</div>
      ) : (
        <div className="space-y-1.5">
          {paramDefs.map((def) => {
            const value = params[def.name] ?? def.default;
            return (
              <div key={def.name} className="space-y-0 group">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-400">{def.label ?? def.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-zinc-200 tabular-nums" data-testid={`inspector-param-value-${def.name}`}>
                      {def.type === 'int' ? value : value.toFixed(4)}
                    </span>
                    {def.isUser && (
                      <button
                        onClick={() => commandRegistry.execute('param.remove', { name: def.name })}
                        className="text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[9px]"
                        title={`Remove ${def.name}`}
                        data-testid={`inspector-param-remove-${def.name}`}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
                <ParamSlider
                  name={def.name}
                  value={value}
                  min={def.min ?? 0}
                  max={def.max ?? 1}
                  step={def.step ?? (def.type === 'int' ? 1 : 0.001)}
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
