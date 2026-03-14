/**
 * CellPanel: left drawer panel showing cell type cards.
 *
 * Phase 2: visual shell that reads cell property definitions from simStore.
 * Shows a single card for the current preset's cell properties.
 *
 * Phase 3 will wire this to CellTypeRegistry for real type hierarchy.
 * Phase 7 will add "Add Cell Type" button, duplicate, color picker, etc.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { useSimStore } from '@/store/simStore';
import { CellCard } from './CellCard';
import type { CellPropertyInfo } from './CellCard';

/** Derive a display name from the preset name */
function cellTypeName(preset: string | null): string {
  if (!preset) return 'Cell';
  // e.g. "Conway's Game of Life" → "GoL Cell", but just use preset for now
  return `${preset} Cell`;
}

/** Pick a display color based on the preset */
function cellTypeColor(preset: string | null): string {
  if (!preset) return '#4ade80'; // green-400
  const lower = preset.toLowerCase();
  if (lower.includes('gray') || lower.includes('scott')) return '#60a5fa'; // blue-400
  if (lower.includes('navier') || lower.includes('stokes')) return '#818cf8'; // indigo-400
  if (lower.includes('brain')) return '#f472b6'; // pink-400
  if (lower.includes('langton')) return '#facc15'; // yellow-400
  if (lower.includes('rule')) return '#fb923c'; // orange-400
  return '#4ade80'; // green-400
}

export function CellPanel(_props: PanelProps) {
  const activePreset = useSimStore((s) => s.activePreset);
  const cellProperties = useSimStore((s) => s.cellProperties);

  const properties: CellPropertyInfo[] = cellProperties.map((p) => ({
    name: p.name,
    type: p.type,
    default: p.default,
    role: p.role,
  }));

  return (
    <div className="h-full bg-zinc-900/95 overflow-y-auto" data-testid="cell-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="text-sm font-mono text-zinc-300">Cells</span>
        {/* Add Cell Type button — disabled until Phase 7 */}
        <button
          disabled
          className="text-[10px] font-mono text-zinc-600 cursor-not-allowed"
          title="Add cell type (coming soon)"
        >
          + Type
        </button>
      </div>

      {/* Cell cards */}
      <div className="px-3 py-3 space-y-2">
        {properties.length > 0 ? (
          <CellCard
            typeName={cellTypeName(activePreset)}
            color={cellTypeColor(activePreset)}
            properties={properties}
          />
        ) : (
          <p className="text-[10px] font-mono text-zinc-600 italic px-1">
            No simulation loaded
          </p>
        )}
      </div>
    </div>
  );
}
