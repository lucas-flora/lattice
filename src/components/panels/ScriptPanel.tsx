/**
 * ScriptPanel: Variables + unified Tags section.
 *
 * All mutations go through commandRegistry.execute() (Three Surface Doctrine).
 * Local useState manages only edit-in-progress values.
 */

'use client';

import { useState, useCallback } from 'react';
import { useScriptStore } from '@/store/scriptStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { UnifiedTagsSection } from './UnifiedTagsSection';

/** Parse a numeric string with a fallback that handles "0" correctly. */
function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s);
  return isNaN(n) ? fallback : n;
}

// --- Section wrapper with optional action buttons ---

function Section({
  title,
  defaultOpen = true,
  onAdd,
  onClearAll,
  showClearAll = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onAdd?: () => void;
  onClearAll?: () => void;
  showClearAll?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-700/50">
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-300 cursor-pointer"
        >
          <span>{title}</span>
          <span className="text-zinc-500">{open ? '\u25B4' : '\u25BE'}</span>
        </button>
        <div className="flex items-center gap-1">
          {showClearAll && onClearAll && (
            <button
              onClick={onClearAll}
              className="text-[10px] text-zinc-500 hover:text-red-400 cursor-pointer"
              title="Clear all"
            >
              Clear
            </button>
          )}
          {onAdd && (
            <button
              onClick={onAdd}
              className="text-zinc-500 hover:text-green-400 text-sm leading-none cursor-pointer px-1"
              title="Add"
            >
              +
            </button>
          )}
        </div>
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

// --- Pyodide Status ---

function PyodideStatus() {
  const status = useScriptStore((s) => s.pyodideStatus);
  const progress = useScriptStore((s) => s.pyodideProgress);

  if (status === 'ready' || status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className="mx-3 mb-3">
        <div className="text-xs text-zinc-400 mb-1">Loading Python runtime...</div>
        <div className="h-1.5 w-full rounded-full bg-zinc-700">
          <div
            className="h-1.5 rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-3 text-xs text-red-400">
      Python runtime failed to load
    </div>
  );
}

// --- Variables Section ---

function VariablesSection() {
  const variables = useScriptStore((s) => s.globalVariables);
  const entries = Object.entries(variables);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [newVarType, setNewVarType] = useState<'float' | 'int' | 'string'>('float');
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleAdd = useCallback(() => {
    if (!newVarName.trim()) return;
    let parsed: number | string;
    if (newVarType === 'string') {
      parsed = newVarValue;
    } else if (newVarType === 'int') {
      const n = parseInt(newVarValue, 10);
      parsed = isNaN(n) ? 0 : n;
    } else {
      parsed = parseNum(newVarValue, 0);
    }
    commandRegistry.execute('var.set', { name: newVarName.trim(), value: parsed });
    setNewVarName('');
    setNewVarValue('');
  }, [newVarName, newVarValue, newVarType]);

  const handleDelete = useCallback((name: string) => {
    commandRegistry.execute('var.delete', { name });
  }, []);

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

  const handleClearAll = useCallback(() => {
    commandRegistry.execute('var.clear', {});
  }, []);

  return (
    <Section
      title="Variables"
      onAdd={() => setShowAddForm(!showAddForm)}
      onClearAll={handleClearAll}
      showClearAll={entries.length > 0}
    >
      {showAddForm && (
        <div className="mb-2 space-y-1.5" data-testid="var-add-form">
          <div className="flex gap-1">
            <input
              className="flex-1 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
              placeholder="name"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              data-testid="var-name-input"
            />
            <input
              className="w-20 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
              placeholder="value"
              value={newVarValue}
              onChange={(e) => setNewVarValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              data-testid="var-value-input"
            />
          </div>
          <div className="flex gap-1 items-center">
            <select
              className="bg-zinc-800 text-xs text-zinc-300 rounded px-1.5 py-1 outline-none cursor-pointer"
              value={newVarType}
              onChange={(e) => setNewVarType(e.target.value as 'float' | 'int' | 'string')}
              data-testid="var-type-select"
            >
              <option value="float">float</option>
              <option value="int">int</option>
              <option value="string">string</option>
            </select>
            <button
              className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-1 cursor-pointer"
              onClick={handleAdd}
              data-testid="var-add-btn"
            >
              Add
            </button>
          </div>
        </div>
      )}
      {entries.length === 0 && !showAddForm ? (
        <div className="text-xs text-zinc-500 italic">No global variables</div>
      ) : (
        <div className="space-y-1">
          {entries.map(([name, { value, type }]) => (
            <div
              key={name}
              className="flex items-center justify-between text-xs font-mono group"
            >
              <span className="text-zinc-300 truncate">{name}</span>
              <div className="flex items-center gap-1">
                {editingVar === name ? (
                  <input
                    className="w-20 bg-zinc-800 text-xs text-green-400 rounded px-1.5 py-0.5 font-mono tabular-nums outline-none focus:ring-1 focus:ring-green-500/50"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditCommit(name);
                      if (e.key === 'Escape') handleEditCancel();
                    }}
                    onBlur={() => handleEditCommit(name)}
                    autoFocus
                    data-testid="var-edit-input"
                  />
                ) : (
                  <span
                    className="text-green-400 tabular-nums cursor-pointer hover:underline"
                    onClick={() => handleEditStart(name, value)}
                    data-testid="var-value-display"
                  >
                    {typeof value === 'number' ? value.toFixed(type === 'int' ? 0 : 3) : String(value)}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(name)}
                  className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Delete"
                  data-testid="var-delete-btn"
                >
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Main Panel ---

interface ScriptPanelProps {
  docked?: boolean;
}

export function ScriptPanel({ docked = false }: ScriptPanelProps) {
  const isOpen = useLayoutStore((s) => s.isScriptPanelOpen);
  const scriptPanelWidth = useLayoutStore((s) => s.scriptPanelWidth);
  const d4Open = useLayoutStore((s) => s.isDrawer4Open);
  const d4Width = useLayoutStore((s) => s.drawer4Width);

  const handleClose = useCallback(() => {
    commandRegistry.execute('ui.toggleScriptPanel', {});
  }, []);

  const handlePanelResize = useCallback(
    (delta: number) => {
      layoutStoreActions.setScriptPanelWidth(scriptPanelWidth - delta);
    },
    [scriptPanelWidth],
  );

  const panelContent = (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-300 overflow-auto border-l border-zinc-700/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700/50">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Scripting</span>
        <button
          onClick={handleClose}
          className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer"
          title="Close"
        >
          &times;
        </button>
      </div>
      <PyodideStatus />
      <VariablesSection />
      <UnifiedTagsSection />
    </div>
  );

  if (docked) {
    return (
      <div className="relative shrink-0 h-full" style={{ width: scriptPanelWidth }} data-testid="script-panel">
        <div className="absolute inset-0 overflow-hidden">
          {panelContent}
        </div>
        <div className="absolute left-1 top-0 bottom-0 z-10 flex">
          <ResizeHandle direction="horizontal" onResize={handlePanelResize} onDoubleClick={handleClose} />
        </div>
      </div>
    );
  }

  // Floating mode — offset right by Metrics panel width when it's also open
  const rightOffset = d4Open ? d4Width : 0;

  return (
    <div
      className={`absolute top-0 bottom-0 z-15 transition-all duration-200 ease-out pointer-events-auto ${isOpen ? '' : 'pointer-events-none'}`}
      style={{
        width: scriptPanelWidth,
        right: rightOffset,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
      }}
      data-testid="script-panel"
    >
      <div className="absolute inset-0 overflow-hidden">
        {panelContent}
      </div>
      <div className="absolute left-1 top-0 bottom-0 z-10 flex">
        <ResizeHandle direction="horizontal" onResize={handlePanelResize} onDoubleClick={handleClose} />
      </div>
    </div>
  );
}
