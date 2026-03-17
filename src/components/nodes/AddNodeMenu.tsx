/**
 * AddNodeMenu: searchable, categorized menu for adding nodes.
 *
 * Opened via right-click or Tab key in the node editor canvas.
 */

'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './nodeTheme';
import type { NodeCategory } from '@/engine/nodes/types';

interface AddNodeMenuProps {
  position: { x: number; y: number };
  onSelect: (type: string) => void;
  onClose: () => void;
}

export function AddNodeMenu({ position, onSelect, onClose }: AddNodeMenuProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allTypes = useMemo(() => nodeTypeRegistry.getAll(), []);

  const filtered = useMemo(() => {
    if (!search) return allTypes;
    const q = search.toLowerCase();
    return allTypes.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [allTypes, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<NodeCategory, typeof filtered>();
    for (const node of filtered) {
      const list = groups.get(node.category) ?? [];
      list.push(node);
      groups.set(node.category, list);
    }
    return groups;
  }, [filtered]);

  const flatList = useMemo(() => filtered, [filtered]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && flatList[selectedIndex]) {
        e.preventDefault();
        onSelect(flatList[selectedIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [flatList, selectedIndex, onSelect, onClose],
  );

  let itemIndex = 0;

  return (
    <div
      className="fixed z-50 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-md shadow-xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: 220, maxHeight: 340 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-1.5">
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-green-500/50"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="overflow-y-auto max-h-[280px]">
        {Array.from(grouped.entries()).map(([category, nodes]) => (
          <div key={category}>
            <div
              className="px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider"
              style={{ color: CATEGORY_COLORS[category] }}
            >
              {CATEGORY_LABELS[category]}
            </div>
            {nodes.map((node) => {
              const thisIndex = itemIndex++;
              return (
                <button
                  key={node.type}
                  className={`w-full text-left px-2.5 py-1 text-xs font-mono cursor-pointer transition-colors ${
                    thisIndex === selectedIndex
                      ? 'bg-zinc-700/60 text-zinc-200'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                  onClick={() => onSelect(node.type)}
                  onMouseEnter={() => setSelectedIndex(thisIndex)}
                >
                  {node.label}
                </button>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-2.5 py-3 text-xs text-zinc-600 font-mono text-center">
            No matching nodes
          </div>
        )}
      </div>
    </div>
  );
}
