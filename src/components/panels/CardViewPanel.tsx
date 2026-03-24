/**
 * CardViewPanel: unified filtered card view of the scene graph.
 *
 * One component powers both drawer 2 (default: cells) and drawer 3 (default: ops+globals).
 * Multi-select type filters. Collapsible sections per type with per-section + buttons.
 * Op cards use OpRow for rich editing. Variable cards have inline editing.
 * All mutations via commandRegistry.execute() (Three Surface Doctrine).
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import type { PanelProps } from '@/layout/types';
import { useSceneStore } from '@/store/sceneStore';
import { useSimStore } from '@/store/simStore';
import { useScriptStore } from '@/store/scriptStore';
import { useExpressionStore } from '@/store/expressionStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { CellCard } from './CellCard';
import { OpRow } from './OpRow';
import { OpAddForm } from './OpAddForm';
import { NODE_TYPES } from '@/engine/scene/SceneNode';
import type { SceneNode } from '@/engine/scene/SceneNode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterKey = 'cells' | 'env' | 'globals' | 'ops';

const FILTER_DEFS: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'cells', label: 'Cells', icon: '\u25A3' },
  { key: 'env', label: 'Env', icon: '\u2699' },
  { key: 'globals', label: 'Vars', icon: 'x' },
  { key: 'ops', label: 'Ops', icon: '\u0192' },
];

interface CardViewPanelProps extends Partial<PanelProps> {
  /** Which filters are active by default */
  defaultFilters?: FilterKey[];
}

// ---------------------------------------------------------------------------
// Pyodide status (shown when tags or globals are in view)
// ---------------------------------------------------------------------------

function PyodideStatus() {
  const status = useScriptStore((s) => s.pyodideStatus);
  const progress = useScriptStore((s) => s.pyodideProgress);

  if (status === 'ready' || status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className="mx-3 mb-2">
        <div className="text-[10px] text-zinc-400 mb-1">Loading Python runtime...</div>
        <div className="h-1 w-full rounded-full bg-zinc-700">
          <div
            className="h-1 rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 text-[10px] text-red-400">
      Python runtime failed to load
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section header with + button
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  count,
  open,
  onToggle,
  onAdd,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1 px-0.5">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300 cursor-pointer"
      >
        <span className="text-zinc-600">{open ? '\u25B4' : '\u25BE'}</span>
        <span>{title}</span>
        <span className="text-zinc-600 tabular-nums">({count})</span>
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="text-zinc-600 hover:text-green-400 text-[11px] cursor-pointer leading-none"
          title={`Add ${title.toLowerCase()}`}
        >
          +
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variable card with inline editing (from ScriptPanel's VariablesSection)
// ---------------------------------------------------------------------------

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s);
  return isNaN(n) ? fallback : n;
}

function VariableCard({
  name,
  value,
  type,
  isEditing,
  editValue,
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
  onDelete,
}: {
  name: string;
  value: number | string;
  type: string;
  isEditing: boolean;
  editValue: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-zinc-800/60 rounded border border-zinc-700/50 px-2 py-1 group" data-testid={`var-card-${name}`}>
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-zinc-300 truncate">{name}</span>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-600">{type}</span>
          {isEditing ? (
            <input
              className="w-16 bg-zinc-900 text-[11px] text-green-400 rounded px-1 py-0.5 font-mono tabular-nums outline-none focus:ring-1 focus:ring-green-500/50"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditCommit();
                if (e.key === 'Escape') onEditCancel();
              }}
              onBlur={onEditCommit}
              autoFocus
              data-testid="var-edit-input"
            />
          ) : (
            <span
              className="text-green-400 tabular-nums cursor-pointer hover:underline"
              onClick={onEditStart}
              data-testid="var-value-display"
            >
              {typeof value === 'number' ? value.toFixed(type === 'int' ? 0 : 3) : String(value)}
            </span>
          )}
          <button
            onClick={onDelete}
            className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-[9px]"
            title="Delete"
            data-testid="var-delete-btn"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}

function VariableAddForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<'float' | 'int' | 'string'>('float');
  const [error, setError] = useState('');

  const handleAdd = useCallback(async () => {
    if (!name.trim()) return;
    let parsed: number | string;
    if (type === 'string') {
      parsed = value;
    } else if (type === 'int') {
      const n = parseInt(value, 10);
      parsed = isNaN(n) ? 0 : n;
    } else {
      parsed = parseNum(value, 0);
    }
    const result = await commandRegistry.execute('var.set', { name: name.trim(), value: parsed });
    if (result && !result.success) {
      setError(result.error ?? 'Failed to set variable');
      return;
    }
    onClose();
  }, [name, value, type, onClose]);

  return (
    <div className="bg-zinc-900 border border-zinc-700/50 rounded p-1.5 space-y-1 mb-1" data-testid="var-add-form">
      {error && (
        <div className="text-[10px] font-mono text-red-400 px-1">{error}</div>
      )}
      <div className="flex gap-1 items-center">
        <input
          className="flex-1 min-w-0 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="name"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          data-testid="var-name-input"
          autoFocus
        />
        <input
          className="w-14 bg-zinc-800 text-[11px] text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          data-testid="var-value-input"
        />
        <select
          className="bg-zinc-800 text-[11px] text-zinc-300 rounded px-1 py-0.5 outline-none cursor-pointer"
          value={type}
          onChange={(e) => setType(e.target.value as 'float' | 'int' | 'string')}
          data-testid="var-type-select"
        >
          <option value="float">float</option>
          <option value="int">int</option>
          <option value="string">string</option>
        </select>
      </div>
      <div className="flex gap-1 items-center">
        <button
          className="text-[11px] bg-green-600 hover:bg-green-500 text-white rounded px-1.5 py-0.5 cursor-pointer"
          onClick={handleAdd}
          data-testid="var-add-btn"
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

// ---------------------------------------------------------------------------
// Variables section content (inline in card view)
// ---------------------------------------------------------------------------

function VariablesCards() {
  const variables = useScriptStore((s) => s.globalVariables);
  const entries = Object.entries(variables);
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEditStart = useCallback((name: string, value: number | string) => {
    setEditingVar(name);
    setEditValue(String(value));
  }, []);

  const handleEditCommit = useCallback((name: string) => {
    const num = Number(editValue);
    const parsed = isNaN(num) ? editValue : num;
    commandRegistry.execute('var.set', { name, value: parsed });
    setEditingVar(null);
  }, [editValue]);

  const handleEditCancel = useCallback(() => {
    setEditingVar(null);
  }, []);

  const handleDelete = useCallback((name: string) => {
    commandRegistry.execute('var.delete', { name });
  }, []);

  if (entries.length === 0) {
    return <p className="text-[10px] font-mono text-zinc-600 italic px-1">No variables</p>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([name, { value, type }]) => (
        <VariableCard
          key={name}
          name={name}
          value={value}
          type={type}
          isEditing={editingVar === name}
          editValue={editValue}
          onEditStart={() => handleEditStart(name, value)}
          onEditChange={setEditValue}
          onEditCommit={() => handleEditCommit(name)}
          onEditCancel={handleEditCancel}
          onDelete={() => handleDelete(name)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cell cards
// ---------------------------------------------------------------------------

function CellCards({
  nodes,
  selectedNodeId,
  onSelect,
}: {
  nodes: SceneNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const cellTypes = useSimStore((s) => s.cellTypes);
  const cellProperties = useSimStore((s) => s.cellProperties);

  if (cellTypes.length > 0) {
    return (
      <>
        {cellTypes.map((ct) => {
          const sceneNode = nodes.find(
            (n) => n.name === ct.name || (n.properties as Record<string, unknown>).cellTypeId === ct.id,
          );
          const nodeId = sceneNode?.id ?? ct.id;
          const isSelected = selectedNodeId === nodeId;
          return (
            <div
              key={ct.id}
              onClick={() => onSelect(nodeId)}
              className={`cursor-pointer rounded transition-colors ${isSelected ? 'ring-1 ring-green-500/60' : ''}`}
              data-testid={`card-cell-${ct.id}`}
            >
              <CellCard
                typeName={ct.name}
                typeId={ct.id}
                color={ct.color}
                properties={ct.properties.map((p) => ({
                  name: p.name,
                  type: p.type,
                  default: p.default,
                  role: p.role,
                  isInherent: p.isInherent,
                }))}
              />
            </div>
          );
        })}
      </>
    );
  }

  if (cellProperties.length > 0) {
    return (
      <div
        onClick={() => nodes[0] && onSelect(nodes[0].id)}
        className={`cursor-pointer rounded transition-colors ${
          nodes[0] && selectedNodeId === nodes[0].id ? 'ring-1 ring-green-500/60' : ''
        }`}
      >
        <CellCard
          typeName="Cell"
          typeId="default"
          color="#4ade80"
          properties={cellProperties.map((p) => ({
            name: p.name,
            type: p.type,
            default: p.default,
            role: p.role,
          }))}
        />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Op cards (using OpRow for rich editing)
// ---------------------------------------------------------------------------

function OpCards() {
  const tags = useExpressionStore((s) => s.tags);

  if (tags.length === 0) {
    return <p className="text-[10px] font-mono text-zinc-600 italic px-1">No operators</p>;
  }

  return (
    <div className="space-y-1.5">
      {tags.map((op) => (
        <OpRow key={op.id} op={op} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic node cards (env, etc.)
// ---------------------------------------------------------------------------

function GenericCards({
  nodes,
  selectedNodeId,
  onSelect,
}: {
  nodes: SceneNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node) => {
        const isSelected = selectedNodeId === node.id;
        const propCount = Object.keys(node.properties).length;

        const badgeClass =
          node.type === NODE_TYPES.ENVIRONMENT
            ? 'bg-amber-500/15 text-amber-400'
            : node.type === NODE_TYPES.GLOBALS
              ? 'bg-cyan-500/15 text-cyan-400'
              : node.type === NODE_TYPES.GROUP
                ? 'bg-zinc-700 text-zinc-400'
                : 'bg-zinc-700 text-zinc-400';

        return (
          <div
            key={node.id}
            onClick={() => onSelect(node.id)}
            className={`bg-zinc-800/60 rounded border cursor-pointer transition-colors hover:bg-zinc-700/30 ${
              isSelected ? 'border-green-500/60 ring-1 ring-green-500/30' : 'border-zinc-700/50'
            }`}
            data-testid={`card-node-${node.id}`}
          >
            <div className="px-2 py-1 flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${node.enabled ? 'bg-green-400' : 'bg-zinc-600'}`} />
              <span className="text-[11px] font-mono text-zinc-200 flex-1 truncate">{node.name}</span>
              <span className={`text-[9px] font-mono px-1 rounded leading-tight ${badgeClass}`}>{node.type}</span>
              <span className="text-[9px] font-mono text-zinc-600 tabular-nums">
                {propCount > 0 ? `${propCount}p` : ''}
                {node.childIds.length > 0 ? ` ${node.childIds.length}c` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main CardViewPanel
// ---------------------------------------------------------------------------

export function CardViewPanel({ defaultFilters }: CardViewPanelProps) {
  const initFilters = defaultFilters ?? ['cells'];
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set(initFilters));
  const [collapsedSections, setCollapsedSections] = useState<Set<FilterKey>>(new Set());
  const [showOpAddForm, setShowOpAddForm] = useState(false);
  const [showVarAddForm, setShowVarAddForm] = useState(false);

  const nodes = useSceneStore((s) => s.nodes);
  const selectedNodeId = useSceneStore((s) => s.selectedNodeId);
  const tags = useExpressionStore((s) => s.tags);
  const variables = useScriptStore((s) => s.globalVariables);

  const allNodes = useMemo(() => Object.values(nodes), [nodes]);

  // Nodes per section
  const cellNodes = useMemo(() => allNodes.filter((n) => n.type === NODE_TYPES.CELL_TYPE), [allNodes]);
  const envNodes = useMemo(() => allNodes.filter((n) => n.type === NODE_TYPES.ENVIRONMENT), [allNodes]);

  const handleSelect = useCallback((id: string) => {
    commandRegistry.execute('scene.select', { id });
  }, []);

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow deselecting all filters
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((key: FilterKey) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Build visible sections
  const activeSections = useMemo(() => {
    const sections: FilterKey[] = [];
    for (const f of FILTER_DEFS) {
      if (activeFilters.has(f.key)) sections.push(f.key);
    }
    return sections;
  }, [activeFilters]);

  const multiSection = activeSections.length > 1;

  // Counts per section
  const sectionCounts: Record<FilterKey, number> = useMemo(
    () => ({
      cells: cellNodes.length,
      env: envNodes.length,
      globals: Object.keys(variables).length,
      ops: tags.length,
    }),
    [cellNodes, envNodes, variables, tags],
  );

  const totalCount = activeSections.reduce((sum, key) => sum + sectionCounts[key], 0);

  // Show pyodide status when ops or globals are in the view
  const showPyodide = activeFilters.has('ops') || activeFilters.has('globals');

  // Add handler per section
  const handleAddForSection = useCallback((key: FilterKey) => {
    switch (key) {
      case 'ops':
        setShowOpAddForm(true);
        break;
      case 'globals':
        setShowVarAddForm(true);
        break;
      case 'cells':
        commandRegistry.execute('scene.add', { type: 'cell-type', name: 'New Cell Type' });
        break;
      case 'env':
        // Environment is usually singleton
        break;
    }
  }, []);

  // Render cards for a section
  const renderSection = (key: FilterKey) => {
    const isOpen = !collapsedSections.has(key);

    const sectionContent = (() => {
      if (!isOpen) return null;
      switch (key) {
        case 'cells':
          return cellNodes.length > 0 ? (
            <CellCards nodes={cellNodes} selectedNodeId={selectedNodeId} onSelect={handleSelect} />
          ) : (
            <p className="text-[10px] font-mono text-zinc-600 italic px-1">No cell types</p>
          );
        case 'env':
          return envNodes.length > 0 ? (
            <GenericCards nodes={envNodes} selectedNodeId={selectedNodeId} onSelect={handleSelect} />
          ) : (
            <p className="text-[10px] font-mono text-zinc-600 italic px-1">No environment nodes</p>
          );
        case 'globals':
          return (
            <>
              {showVarAddForm && <VariableAddForm onClose={() => setShowVarAddForm(false)} />}
              <VariablesCards />
            </>
          );
        case 'ops':
          return (
            <>
              {showOpAddForm && <OpAddForm onClose={() => setShowOpAddForm(false)} />}
              <OpCards />
            </>
          );
        default:
          return null;
      }
    })();

    if (multiSection) {
      const def = FILTER_DEFS.find((f) => f.key === key)!;
      const canAdd = key === 'ops' || key === 'globals' || key === 'cells';
      return (
        <div key={key} className="mb-1">
          <SectionHeader
            title={def.label}
            count={sectionCounts[key]}
            open={isOpen}
            onToggle={() => toggleSection(key)}
            onAdd={canAdd ? () => handleAddForSection(key) : undefined}
          />
          {sectionContent && <div className="space-y-1 px-0.5 pb-1">{sectionContent}</div>}
        </div>
      );
    }

    // Single section — no header needed, just cards
    return (
      <div key={key} className="space-y-1.5">
        {sectionContent}
      </div>
    );
  };

  return (
    <div className="h-full bg-zinc-900/95 overflow-y-auto" data-testid="card-view-panel">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800/50">
        {FILTER_DEFS.map((f) => {
          const active = activeFilters.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                active
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'text-zinc-600 hover:text-zinc-400 border border-transparent'
              }`}
              data-testid={`filter-${f.key}`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[9px] font-mono text-zinc-600 tabular-nums">
          {totalCount}
        </span>
        {/* Global + button for single-section mode */}
        {!multiSection && activeSections.length === 1 && (
          (() => {
            const key = activeSections[0];
            const canAdd = key === 'ops' || key === 'globals' || key === 'cells';
            if (!canAdd) return null;
            return (
              <button
                onClick={() => handleAddForSection(key)}
                className="text-zinc-600 hover:text-green-400 text-xs cursor-pointer px-1 leading-none"
                title="Add"
              >
                +
              </button>
            );
          })()
        )}
      </div>

      {/* Pyodide status */}
      {showPyodide && <PyodideStatus />}

      {/* Cards */}
      <div className="px-2 py-1.5">
        {activeSections.map(renderSection)}

        {totalCount === 0 && !showOpAddForm && !showVarAddForm && (
          <p className="text-[10px] font-mono text-zinc-600 italic px-1 py-2">
            No items
          </p>
        )}
      </div>
    </div>
  );
}
