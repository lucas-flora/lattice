/**
 * AddNodeMenu: hierarchical searchable menu for adding nodes.
 *
 * Structure:
 *   Objects > Cell Types > [cell type names], Environment, Globals
 *   Math > Add, Subtract, ...
 *   Range > RangeMap, Clamp, ...
 *   Logic > Compare, And, ...
 *   Utility > Random, Sum, ...
 *   Property (advanced) > Read Property, Write Property, Constant, Time
 *
 * Opened via right-click or Tab key in the node editor canvas.
 */

'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { nodeTypeRegistry } from '@/engine/nodes/NodeTypeRegistry';
import { getAllSceneObjects } from '@/engine/nodes/sceneDataResolver';
import { CATEGORY_COLORS } from './nodeTheme';
import type { NodeCategory } from '@/engine/nodes/types';
import type { SceneObject } from '@/engine/nodes/sceneDataResolver';

interface AddNodeMenuProps {
  position: { x: number; y: number };
  onSelect: (type: string) => void;
  onClose: () => void;
}

/** A flat item for keyboard navigation */
interface MenuItem {
  id: string;
  label: string;
  /** Type string to pass to onSelect */
  selectType: string;
  /** Category for coloring */
  category: NodeCategory | 'object-sub';
  /** Search keywords */
  keywords: string;
}

/** Standard node categories in display order (objects come first, property last) */
const CATEGORY_ORDER: NodeCategory[] = ['math', 'range', 'logic', 'utility', 'property'];

const CATEGORY_DISPLAY: Record<string, string> = {
  math: 'Math',
  range: 'Range',
  logic: 'Logic',
  utility: 'Utility',
  property: 'Property (advanced)',
};

export function AddNodeMenu({ position, onSelect, onClose }: AddNodeMenuProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Gather scene objects
  const sceneObjects = useMemo(() => getAllSceneObjects(), []);
  const cellTypes = useMemo(
    () => sceneObjects.filter((o) => o.kind === 'cell-type'),
    [sceneObjects],
  );
  const envObject = useMemo(
    () => sceneObjects.find((o) => o.kind === 'environment'),
    [sceneObjects],
  );
  const globalsObject = useMemo(
    () => sceneObjects.find((o) => o.kind === 'globals'),
    [sceneObjects],
  );

  // All registered node types (excluding ObjectNode skeleton)
  const allTypes = useMemo(
    () => nodeTypeRegistry.getAll().filter((t) => t.type !== 'ObjectNode'),
    [],
  );

  // Build flat menu items for search
  const allItems = useMemo(() => {
    const items: MenuItem[] = [];

    // Object items
    for (const ct of cellTypes) {
      items.push({
        id: `obj:${ct.id}`,
        label: ct.name,
        selectType: `Object:cell-type:${ct.id}:${ct.name}`,
        category: 'object-sub',
        keywords: `object cell ${ct.name} ${ct.properties.map((p) => p.name).join(' ')}`,
      });
    }
    if (envObject) {
      items.push({
        id: 'obj:env',
        label: 'Environment',
        selectType: `Object:environment:env:Environment`,
        category: 'object-sub',
        keywords: `object environment env ${envObject.properties.map((p) => p.name).join(' ')}`,
      });
    }
    if (globalsObject) {
      items.push({
        id: 'obj:globals',
        label: 'Globals',
        selectType: `Object:globals:globals:Globals`,
        category: 'object-sub',
        keywords: `object globals global ${globalsObject.properties.map((p) => p.name).join(' ')}`,
      });
    }

    // Standard node type items
    for (const node of allTypes) {
      items.push({
        id: `node:${node.type}`,
        label: node.label,
        selectType: node.type,
        category: node.category,
        keywords: `${node.label} ${node.type} ${node.category}`,
      });
    }

    return items;
  }, [allTypes, cellTypes, envObject, globalsObject]);

  // Filtered items when searching
  const filtered = useMemo(() => {
    if (!search) return null; // null means show hierarchical view
    const q = search.toLowerCase();
    return allItems.filter((item) => item.keywords.toLowerCase().includes(q));
  }, [search, allItems]);

  const flatList = filtered ?? [];

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered) {
          setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered) {
          setSelectedIndex((i) => Math.max(i - 1, 0));
        }
      } else if (e.key === 'Enter' && filtered && flatList[selectedIndex]) {
        e.preventDefault();
        onSelect(flatList[selectedIndex].selectType);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, flatList, selectedIndex, onSelect, onClose],
  );

  const objectColor = CATEGORY_COLORS.object;

  return (
    <div
      className="fixed z-50 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-md shadow-xl overflow-hidden"
      style={{ left: position.x, top: position.y, width: 240, maxHeight: 400 }}
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

      <div className="overflow-y-auto max-h-[340px]">
        {filtered ? (
          // --- SEARCH RESULTS (flat) ---
          <>
            {flatList.map((item, idx) => (
              <button
                key={item.id}
                className={`w-full text-left px-2.5 py-1 text-xs font-mono cursor-pointer transition-colors ${
                  idx === selectedIndex
                    ? 'bg-zinc-700/60 text-zinc-200'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
                onClick={() => onSelect(item.selectType)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="text-zinc-600 text-[9px] mr-1.5">
                  {item.category === 'object-sub' ? 'OBJ' : item.category.toUpperCase().slice(0, 3)}
                </span>
                {item.label}
              </button>
            ))}
            {flatList.length === 0 && (
              <div className="px-2.5 py-3 text-xs text-zinc-600 font-mono text-center">
                No matching nodes
              </div>
            )}
          </>
        ) : (
          // --- HIERARCHICAL VIEW ---
          <>
            {/* Objects section */}
            <div>
              <button
                className="w-full text-left px-2.5 py-1 text-[9px] font-mono font-semibold uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50"
                style={{ color: objectColor }}
                onClick={() => setExpandedSub(expandedSub === 'objects' ? null : 'objects')}
              >
                Objects {expandedSub === 'objects' ? '\u25BC' : '\u25B6'}
              </button>

              {expandedSub === 'objects' && (
                <div className="ml-2">
                  {/* Cell Types sub-section */}
                  {cellTypes.length > 0 && (
                    <>
                      <div className="px-2 py-0.5 text-[8px] font-mono text-zinc-600 uppercase tracking-wider">
                        Cell Types
                      </div>
                      {cellTypes.map((ct) => (
                        <ObjectMenuItem key={ct.id} obj={ct} onSelect={onSelect} />
                      ))}
                    </>
                  )}

                  {/* Environment */}
                  {envObject && (
                    <ObjectMenuItem obj={envObject} onSelect={onSelect} />
                  )}

                  {/* Globals */}
                  {globalsObject && (
                    <ObjectMenuItem obj={globalsObject} onSelect={onSelect} />
                  )}
                </div>
              )}
            </div>

            {/* Standard categories */}
            {CATEGORY_ORDER.map((category) => {
              const nodes = allTypes.filter((t) => t.category === category);
              if (nodes.length === 0) return null;
              return (
                <div key={category}>
                  <button
                    className="w-full text-left px-2.5 py-1 text-[9px] font-mono font-semibold uppercase tracking-wider cursor-pointer hover:bg-zinc-800/50"
                    style={{ color: CATEGORY_COLORS[category] }}
                    onClick={() =>
                      setExpandedSub(expandedSub === category ? null : category)
                    }
                  >
                    {CATEGORY_DISPLAY[category] ?? category}{' '}
                    {expandedSub === category ? '\u25BC' : '\u25B6'}
                  </button>
                  {expandedSub === category && (
                    <div className="ml-2">
                      {nodes.map((node) => (
                        <button
                          key={node.type}
                          className="w-full text-left px-2.5 py-1 text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 cursor-pointer transition-colors"
                          onClick={() => onSelect(node.type)}
                        >
                          {node.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/** Single object menu item */
function ObjectMenuItem({ obj, onSelect }: { obj: SceneObject; onSelect: (type: string) => void }) {
  return (
    <button
      className="w-full text-left px-2.5 py-1 text-xs font-mono text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 cursor-pointer transition-colors"
      onClick={() =>
        onSelect(`Object:${obj.kind}:${obj.id}:${obj.name}`)
      }
    >
      {obj.name}
      <span className="text-[9px] text-zinc-600 ml-1.5">
        ({obj.properties.length} props)
      </span>
    </button>
  );
}
