/**
 * CellPanel: left drawer panel showing cell type cards.
 *
 * Phase 3: wired to CellTypeRegistry. Reads cellTypes from simStore.
 * Falls back to legacy cellProperties if cellTypes is empty (backward compat).
 *
 * Phase 7 will add "Add Cell Type" button, duplicate, color picker, etc.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { useSimStore } from '@/store/simStore';
import { CellCard } from './CellCard';
import type { CellPropertyInfo } from './CellCard';

export function CellPanel(_props: PanelProps) {
  const cellTypes = useSimStore((s) => s.cellTypes);
  const cellProperties = useSimStore((s) => s.cellProperties);

  // Prefer cellTypes from registry; fall back to legacy cellProperties
  const hasCellTypes = cellTypes.length > 0;

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
        {hasCellTypes ? (
          cellTypes.map((ct) => (
            <CellCard
              key={ct.id}
              typeName={ct.name}
              color={ct.color}
              properties={ct.properties.map((p) => ({
                name: p.name,
                type: p.type,
                default: p.default,
                role: p.role,
                isInherent: p.isInherent,
              }))}
            />
          ))
        ) : cellProperties.length > 0 ? (
          <CellCard
            typeName="Cell"
            color="#4ade80"
            properties={cellProperties.map((p) => ({
              name: p.name,
              type: p.type,
              default: p.default,
              role: p.role,
            }))}
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
