/**
 * ParamSlider: responsive range slider that updates the store directly
 * during drag for smooth visual feedback, then commits via command on release
 * to trigger cache invalidation and full validation.
 */

'use client';

import { useCallback, useRef } from 'react';
import { commandRegistry } from '@/commands/CommandRegistry';
import { simStoreActions } from '@/store/simStore';

interface ParamSliderProps {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  'data-testid'?: string;
}

export function ParamSlider({ name, value, min, max, step, ...rest }: ParamSliderProps) {
  const lastCommitted = useRef(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    // Update store directly for instant visual feedback (label + slider)
    simStoreActions.setParam(name, v);
  }, [name]);

  const handleCommit = useCallback(() => {
    // Commit through the command system for cache invalidation + event emission
    const current = value;
    if (current !== lastCommitted.current) {
      commandRegistry.execute('param.set', { name, value: current });
      lastCommitted.current = current;
    }
  }, [name, value]);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={handleChange}
      onPointerUp={handleCommit}
      onKeyUp={handleCommit}
      className="w-full"
      data-testid={rest['data-testid']}
    />
  );
}
