/**
 * PresetSelector: dropdown for selecting built-in simulation presets.
 *
 * Invokes preset.load through CommandRegistry on selection.
 */

'use client';

import { useCallback } from 'react';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { BUILTIN_PRESET_NAMES } from '@/engine/preset/builtinPresets';

/** Display names for built-in presets */
const PRESET_DISPLAY_NAMES: Record<string, string> = {
  'conways-gol': "Conway's GoL",
  'rule-110': 'Rule 110',
  'langtons-ant': "Langton's Ant",
  'brians-brain': "Brian's Brain",
  'gray-scott': 'Gray-Scott',
  'navier-stokes': 'Navier-Stokes',
};

export function PresetSelector() {
  const activePreset = useSimStore((s) => s.activePreset);

  // Find the preset key that matches the active preset display name
  const activeKey = Object.entries(PRESET_DISPLAY_NAMES).find(
    ([, displayName]) => activePreset?.includes(displayName.replace("'s", "'s")) || activePreset?.includes(displayName)
  )?.[0] ?? '';

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (name) {
      commandRegistry.execute('preset.load', { name });
    }
  }, []);

  return (
    <div className="absolute top-4 right-4 z-10" data-testid="preset-selector">
      <select
        value={activeKey}
        onChange={handleChange}
        className="bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1.5 border border-zinc-700 outline-none cursor-pointer hover:bg-zinc-700 transition-colors"
        data-testid="preset-dropdown"
      >
        <option value="" disabled>Select preset...</option>
        {BUILTIN_PRESET_NAMES.map((name) => (
          <option key={name} value={name}>
            {PRESET_DISPLAY_NAMES[name] || name}
          </option>
        ))}
      </select>
    </div>
  );
}
