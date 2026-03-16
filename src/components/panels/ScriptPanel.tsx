/**
 * ScriptPanel: Interactive UI for global variables, per-property expressions,
 * global scripts, and parameter links.
 *
 * Four collapsible sections with inline add/edit/delete capabilities.
 * All mutations go through commandRegistry.execute() (Three Surface Doctrine).
 * Local useState manages only edit-in-progress values.
 */

'use client';

import { useState, useCallback } from 'react';
import { useScriptStore } from '@/store/scriptStore';
import { useSimStore } from '@/store/simStore';
import { useLinkStore } from '@/store/linkStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useExpressionStore } from '@/store/expressionStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

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

// --- Expressions Section ---

function ExpressionsSection() {
  const expressions = useScriptStore((s) => s.expressions);
  const cellProperties = useSimStore((s) => s.cellProperties);
  const entries = Object.entries(expressions);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newExprProp, setNewExprProp] = useState('');
  const [newExprCode, setNewExprCode] = useState('');
  const [editingExpr, setEditingExpr] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');

  // Properties not already bound to an expression
  const availableProps = cellProperties.filter((p) => !expressions[p.name]);

  const handleAdd = useCallback(() => {
    if (!newExprProp || !newExprCode.trim()) return;
    commandRegistry.execute('expr.set', { property: newExprProp, expression: newExprCode.trim() });
    setNewExprProp('');
    setNewExprCode('');
  }, [newExprProp, newExprCode]);

  const handleClear = useCallback((property: string) => {
    commandRegistry.execute('expr.clear', { property });
  }, []);

  const handleClearAll = useCallback(() => {
    commandRegistry.execute('expr.clearAll', {});
  }, []);

  const handleEditStart = useCallback((prop: string, code: string) => {
    setEditingExpr(prop);
    setEditCode(code);
  }, []);

  const handleEditApply = useCallback(() => {
    if (editingExpr && editCode.trim()) {
      commandRegistry.execute('expr.set', { property: editingExpr, expression: editCode.trim() });
    }
    setEditingExpr(null);
  }, [editingExpr, editCode]);

  const handleEditCancel = useCallback(() => {
    setEditingExpr(null);
  }, []);

  return (
    <Section
      title="Expressions"
      onAdd={() => setShowAddForm(!showAddForm)}
      onClearAll={handleClearAll}
      showClearAll={entries.length > 0}
    >
      {showAddForm && (
        <div className="mb-2 space-y-1.5" data-testid="expr-add-form">
          <select
            className="w-full bg-zinc-800 text-xs text-zinc-300 rounded px-2 py-1 outline-none cursor-pointer"
            value={newExprProp}
            onChange={(e) => setNewExprProp(e.target.value)}
            data-testid="expr-prop-select"
          >
            <option value="">Select property...</option>
            {availableProps.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <textarea
            className="w-full h-16 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none resize-none focus:ring-1 focus:ring-green-500/50"
            placeholder="Expression code..."
            value={newExprCode}
            onChange={(e) => setNewExprCode(e.target.value)}
            data-testid="expr-code-input"
          />
          <button
            className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-1 cursor-pointer"
            onClick={handleAdd}
            data-testid="expr-add-btn"
          >
            Apply
          </button>
        </div>
      )}
      {entries.length === 0 && !showAddForm ? (
        <div className="text-xs text-zinc-500 italic">No active expressions</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([prop, expr]) => (
            <div key={prop} className="group">
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-xs text-zinc-400">{prop}</div>
                <button
                  onClick={() => handleClear(prop)}
                  className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs cursor-pointer"
                  title="Clear"
                  data-testid="expr-clear-btn"
                >
                  &times;
                </button>
              </div>
              {editingExpr === prop ? (
                <div className="space-y-1">
                  <textarea
                    className="w-full h-16 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none resize-none focus:ring-1 focus:ring-green-500/50"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    autoFocus
                    data-testid="expr-edit-textarea"
                  />
                  <div className="flex gap-1">
                    <button
                      className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-0.5 cursor-pointer"
                      onClick={handleEditApply}
                      data-testid="expr-edit-apply"
                    >
                      Apply
                    </button>
                    <button
                      className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      onClick={handleEditCancel}
                      data-testid="expr-edit-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="text-xs font-mono text-green-400 bg-zinc-800 rounded px-2 py-1 break-all cursor-pointer hover:ring-1 hover:ring-zinc-600"
                  onClick={() => handleEditStart(prop, expr)}
                  data-testid="expr-code-display"
                >
                  {expr}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Scripts Section ---

function ScriptsSection() {
  const scripts = useScriptStore((s) => s.globalScripts);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newScriptName, setNewScriptName] = useState('');
  const [newScriptCode, setNewScriptCode] = useState('');
  const [newScriptInputs, setNewScriptInputs] = useState('');
  const [newScriptOutputs, setNewScriptOutputs] = useState('');
  const [editingScript, setEditingScript] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [expandedScript, setExpandedScript] = useState<string | null>(null);

  const parseList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const handleAdd = useCallback(() => {
    if (!newScriptName.trim() || !newScriptCode.trim()) return;
    commandRegistry.execute('script.add', {
      name: newScriptName.trim(),
      code: newScriptCode.trim(),
      inputs: parseList(newScriptInputs),
      outputs: parseList(newScriptOutputs),
    });
    setNewScriptName('');
    setNewScriptCode('');
    setNewScriptInputs('');
    setNewScriptOutputs('');
  }, [newScriptName, newScriptCode, newScriptInputs, newScriptOutputs]);

  const handleToggle = useCallback((name: string, enabled: boolean) => {
    const cmd = enabled ? 'script.disable' : 'script.enable';
    commandRegistry.execute(cmd, { name });
  }, []);

  const handleRemove = useCallback((name: string) => {
    commandRegistry.execute('script.remove', { name });
  }, []);

  const handleClearAll = useCallback(() => {
    commandRegistry.execute('script.clear', {});
  }, []);

  const handleEditStart = useCallback((name: string, code: string) => {
    setEditingScript(name);
    setEditCode(code);
    setExpandedScript(name);
  }, []);

  const handleEditApply = useCallback(() => {
    if (editingScript && editCode.trim()) {
      const existing = scripts.find((s) => s.name === editingScript);
      commandRegistry.execute('script.add', {
        name: editingScript,
        code: editCode.trim(),
        inputs: existing?.inputs ?? [],
        outputs: existing?.outputs ?? [],
      });
    }
    setEditingScript(null);
  }, [editingScript, editCode, scripts]);

  const handleEditCancel = useCallback(() => {
    setEditingScript(null);
  }, []);

  return (
    <Section
      title="Scripts"
      onAdd={() => setShowAddForm(!showAddForm)}
      onClearAll={handleClearAll}
      showClearAll={scripts.length > 0}
    >
      {showAddForm && (
        <div className="mb-2 space-y-1.5" data-testid="script-add-form">
          <input
            className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
            placeholder="Script name"
            value={newScriptName}
            onChange={(e) => setNewScriptName(e.target.value)}
            data-testid="script-name-input"
          />
          <textarea
            className="w-full h-32 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none resize-none focus:ring-1 focus:ring-green-500/50"
            placeholder="Python code..."
            value={newScriptCode}
            onChange={(e) => setNewScriptCode(e.target.value)}
            data-testid="script-code-input"
          />
          <div className="flex gap-1">
            <input
              className="flex-1 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
              placeholder="inputs (comma-separated)"
              value={newScriptInputs}
              onChange={(e) => setNewScriptInputs(e.target.value)}
              data-testid="script-inputs-input"
            />
            <input
              className="flex-1 bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
              placeholder="outputs (comma-separated)"
              value={newScriptOutputs}
              onChange={(e) => setNewScriptOutputs(e.target.value)}
              data-testid="script-outputs-input"
            />
          </div>
          <button
            className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-1 cursor-pointer"
            onClick={handleAdd}
            data-testid="script-add-btn"
          >
            Add
          </button>
        </div>
      )}
      {scripts.length === 0 && !showAddForm ? (
        <div className="text-xs text-zinc-500 italic">No global scripts</div>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => {
            const isExpanded = expandedScript === script.name;
            const isEditing = editingScript === script.name;
            return (
              <div key={script.name} className="bg-zinc-800 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-zinc-300">{script.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleToggle(script.name, script.enabled)}
                      className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                        script.enabled
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-zinc-700 text-zinc-500'
                      }`}
                      data-testid="script-toggle-btn"
                    >
                      {script.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => handleRemove(script.name)}
                      className="text-zinc-500 hover:text-red-400 text-xs cursor-pointer"
                      title="Remove"
                      data-testid="script-remove-btn"
                    >
                      &times;
                    </button>
                  </div>
                </div>
                {isEditing ? (
                  <div className="space-y-1">
                    <textarea
                      className="w-full h-32 bg-zinc-900 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none resize-none focus:ring-1 focus:ring-green-500/50"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      autoFocus
                      data-testid="script-edit-textarea"
                    />
                    <div className="flex gap-1">
                      <button
                        className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-0.5 cursor-pointer"
                        onClick={handleEditApply}
                        data-testid="script-edit-apply"
                      >
                        Apply
                      </button>
                      <button
                        className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        onClick={handleEditCancel}
                        data-testid="script-edit-cancel"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`cursor-pointer ${isExpanded ? '' : 'max-h-12 overflow-hidden'}`}
                    onClick={() => setExpandedScript(isExpanded ? null : script.name)}
                  >
                    <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-all">
                      {script.code}
                    </pre>
                  </div>
                )}
                {isExpanded && !isEditing && (
                  <button
                    className="mt-1 text-[10px] text-zinc-500 hover:text-green-400 cursor-pointer"
                    onClick={() => handleEditStart(script.name, script.code)}
                    data-testid="script-edit-btn"
                  >
                    Edit
                  </button>
                )}
                {(script.inputs?.length || script.outputs?.length) ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {script.inputs?.map((inp) => (
                      <span key={`in-${inp}`} className="text-[9px] bg-zinc-700 text-zinc-400 rounded px-1">
                        in:{inp}
                      </span>
                    ))}
                    {script.outputs?.map((out) => (
                      <span key={`out-${out}`} className="text-[9px] bg-zinc-700 text-zinc-400 rounded px-1">
                        out:{out}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// --- Links Section ---

function LinksSection() {
  const links = useLinkStore((s) => s.links);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newSrcMin, setNewSrcMin] = useState('0');
  const [newSrcMax, setNewSrcMax] = useState('1');
  const [newDstMin, setNewDstMin] = useState('0');
  const [newDstMax, setNewDstMax] = useState('1');
  const [newEasing, setNewEasing] = useState('linear');

  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [editSrcMin, setEditSrcMin] = useState('');
  const [editSrcMax, setEditSrcMax] = useState('');
  const [editDstMin, setEditDstMin] = useState('');
  const [editDstMax, setEditDstMax] = useState('');
  const [editEasing, setEditEasing] = useState('');

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    const cmd = enabled ? 'link.disable' : 'link.enable';
    commandRegistry.execute(cmd, { id });
  }, []);

  const handleRemove = useCallback((id: string) => {
    commandRegistry.execute('link.remove', { id });
  }, []);

  const handleClearAll = useCallback(() => {
    commandRegistry.execute('link.clear', {});
  }, []);

  const handleAdd = useCallback(() => {
    if (!newSource.trim() || !newTarget.trim()) return;
    commandRegistry.execute('link.add', {
      source: newSource.trim(),
      target: newTarget.trim(),
      sourceRange: [parseNum(newSrcMin, 0), parseNum(newSrcMax, 1)],
      targetRange: [parseNum(newDstMin, 0), parseNum(newDstMax, 1)],
      easing: newEasing,
    });
    setNewSource('');
    setNewTarget('');
    setNewSrcMin('0');
    setNewSrcMax('1');
    setNewDstMin('0');
    setNewDstMax('1');
    setNewEasing('linear');
  }, [newSource, newTarget, newSrcMin, newSrcMax, newDstMin, newDstMax, newEasing]);

  const handleEditStart = useCallback((link: { id: string; sourceRange: [number, number]; targetRange: [number, number]; easing: string }) => {
    setEditingLink(link.id);
    setEditSrcMin(String(link.sourceRange[0]));
    setEditSrcMax(String(link.sourceRange[1]));
    setEditDstMin(String(link.targetRange[0]));
    setEditDstMax(String(link.targetRange[1]));
    setEditEasing(link.easing);
  }, []);

  const handleEditApply = useCallback(() => {
    if (!editingLink) return;
    commandRegistry.execute('link.edit', {
      id: editingLink,
      sourceRange: [parseNum(editSrcMin, 0), parseNum(editSrcMax, 1)],
      targetRange: [parseNum(editDstMin, 0), parseNum(editDstMax, 1)],
      easing: editEasing,
    });
    setEditingLink(null);
  }, [editingLink, editSrcMin, editSrcMax, editDstMin, editDstMax, editEasing]);

  const handleEditCancel = useCallback(() => {
    setEditingLink(null);
  }, []);

  const easingOptions = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'];

  return (
    <Section
      title="Links"
      onAdd={() => setShowAddForm(!showAddForm)}
      onClearAll={handleClearAll}
      showClearAll={links.length > 0}
    >
      {showAddForm && (
        <div className="mb-2 space-y-1.5" data-testid="link-add-form">
          <input
            className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
            placeholder="source (cell.* env.* global.*)"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            data-testid="link-source-input"
          />
          <input
            className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-green-500/50"
            placeholder="target (cell.* env.* global.*)"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            data-testid="link-target-input"
          />
          <div className="flex gap-1">
            <div className="flex-1">
              <div className="text-[10px] text-zinc-500 mb-0.5">Source range</div>
              <div className="flex gap-1">
                <input
                  className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-1.5 py-1 font-mono outline-none"
                  value={newSrcMin}
                  onChange={(e) => setNewSrcMin(e.target.value)}
                  data-testid="link-src-min"
                />
                <input
                  className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-1.5 py-1 font-mono outline-none"
                  value={newSrcMax}
                  onChange={(e) => setNewSrcMax(e.target.value)}
                  data-testid="link-src-max"
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[10px] text-zinc-500 mb-0.5">Target range</div>
              <div className="flex gap-1">
                <input
                  className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-1.5 py-1 font-mono outline-none"
                  value={newDstMin}
                  onChange={(e) => setNewDstMin(e.target.value)}
                  data-testid="link-dst-min"
                />
                <input
                  className="w-full bg-zinc-800 text-xs text-zinc-200 rounded px-1.5 py-1 font-mono outline-none"
                  value={newDstMax}
                  onChange={(e) => setNewDstMax(e.target.value)}
                  data-testid="link-dst-max"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <select
              className="bg-zinc-800 text-xs text-zinc-300 rounded px-1.5 py-1 outline-none cursor-pointer"
              value={newEasing}
              onChange={(e) => setNewEasing(e.target.value)}
              data-testid="link-easing-select"
            >
              {easingOptions.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <button
              className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-1 cursor-pointer"
              onClick={handleAdd}
              data-testid="link-add-btn"
            >
              Add
            </button>
          </div>
        </div>
      )}
      {links.length === 0 && !showAddForm ? (
        <div className="text-xs text-zinc-500 italic">No parameter links</div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="bg-zinc-800 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-zinc-300 truncate">
                  {link.source} → {link.target}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(link.id, link.enabled)}
                    className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                      link.enabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-zinc-700 text-zinc-500'
                    }`}
                    data-testid="link-toggle-btn"
                  >
                    {link.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => handleRemove(link.id)}
                    className="text-zinc-500 hover:text-red-400 text-xs cursor-pointer"
                    title="Remove"
                    data-testid="link-remove-btn"
                  >
                    &times;
                  </button>
                </div>
              </div>
              {editingLink === link.id ? (
                <div className="space-y-1 mt-1">
                  <div className="flex gap-1">
                    <div className="flex-1">
                      <div className="text-[10px] text-zinc-500 mb-0.5">Source range</div>
                      <div className="flex gap-1">
                        <input
                          className="w-full bg-zinc-900 text-xs text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none"
                          value={editSrcMin}
                          onChange={(e) => setEditSrcMin(e.target.value)}
                          data-testid="link-edit-src-min"
                        />
                        <input
                          className="w-full bg-zinc-900 text-xs text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none"
                          value={editSrcMax}
                          onChange={(e) => setEditSrcMax(e.target.value)}
                          data-testid="link-edit-src-max"
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-[10px] text-zinc-500 mb-0.5">Target range</div>
                      <div className="flex gap-1">
                        <input
                          className="w-full bg-zinc-900 text-xs text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none"
                          value={editDstMin}
                          onChange={(e) => setEditDstMin(e.target.value)}
                          data-testid="link-edit-dst-min"
                        />
                        <input
                          className="w-full bg-zinc-900 text-xs text-zinc-200 rounded px-1.5 py-0.5 font-mono outline-none"
                          value={editDstMax}
                          onChange={(e) => setEditDstMax(e.target.value)}
                          data-testid="link-edit-dst-max"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 items-center">
                    <select
                      className="bg-zinc-900 text-xs text-zinc-300 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                      value={editEasing}
                      onChange={(e) => setEditEasing(e.target.value)}
                      data-testid="link-edit-easing"
                    >
                      {easingOptions.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                    <button
                      className="text-xs bg-green-600 hover:bg-green-500 text-white rounded px-2 py-0.5 cursor-pointer"
                      onClick={handleEditApply}
                      data-testid="link-edit-apply"
                    >
                      Apply
                    </button>
                    <button
                      className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      onClick={handleEditCancel}
                      data-testid="link-edit-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="text-[10px] font-mono text-zinc-500 cursor-pointer hover:text-zinc-400"
                  onClick={() => handleEditStart(link)}
                  data-testid="link-range-display"
                >
                  [{link.sourceRange.join(', ')}] → [{link.targetRange.join(', ')}] · {link.easing}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// --- Tags Section (unified view of all ExpressionTags) ---

const SOURCE_BADGE: Record<string, { label: string; class: string }> = {
  code: { label: 'ƒ', class: 'text-green-400 bg-green-400/10' },
  link: { label: '⇄', class: 'text-blue-400 bg-blue-400/10' },
  script: { label: '⚡', class: 'text-amber-400 bg-amber-400/10' },
};

function TagsSection() {
  const tags = useExpressionStore((s) => s.tags);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    const cmd = enabled ? 'tag.disable' : 'tag.enable';
    commandRegistry.execute(cmd, { id });
  }, []);

  const handleRemove = useCallback((id: string) => {
    // Remove from both the tag registry and the corresponding legacy system
    const tag = tags.find((t) => t.id === id);
    if (tag?.source === 'link') {
      // For link-sourced tags, use link.clear or just remove the tag
      commandRegistry.execute('tag.disable', { id });
    }
    // For now, just disable. Full removal requires clearing the tag from registry + legacy.
    // This will be simplified once the legacy systems are fully removed.
  }, [tags]);

  if (tags.length === 0) return null;

  return (
    <Section title="Tags" defaultOpen={true}>
      <div className="space-y-1.5">
        {tags.map((tag) => {
          const isExpanded = expandedTag === tag.id;
          const badge = SOURCE_BADGE[tag.source] ?? SOURCE_BADGE.code;
          return (
            <div key={tag.id} className="bg-zinc-800 rounded p-2" data-testid="tag-item">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${badge.class}`}>
                    {badge.label}
                  </span>
                  <span className="text-xs font-mono text-zinc-300 truncate">
                    {tag.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[9px] px-1 py-0.5 rounded ${
                    tag.phase === 'pre-rule'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {tag.phase === 'pre-rule' ? 'pre' : 'post'}
                  </span>
                  <button
                    onClick={() => handleToggle(tag.id, tag.enabled)}
                    className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                      tag.enabled
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-zinc-700 text-zinc-500'
                    }`}
                    data-testid="tag-toggle-btn"
                  >
                    {tag.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              <div
                className={`cursor-pointer ${isExpanded ? '' : 'max-h-8 overflow-hidden'}`}
                onClick={() => setExpandedTag(isExpanded ? null : tag.id)}
              >
                <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-all">
                  {tag.code}
                </pre>
              </div>
              {tag.owner.type !== 'root' && (
                <div className="mt-0.5">
                  <span className="text-[9px] bg-zinc-700 text-zinc-400 rounded px-1">
                    {tag.owner.type}{tag.owner.id ? `:${tag.owner.id}` : ''}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  const isParamPanelOpen = useLayoutStore((s) => s.isParamPanelOpen);
  const paramPanelMode = useLayoutStore((s) => s.paramPanelMode);
  const paramPanelWidth = useLayoutStore((s) => s.paramPanelWidth);

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
      <TagsSection />
      <ExpressionsSection />
      <ScriptsSection />
      <LinksSection />
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

  // Floating mode — offset right by ParamPanel width when ParamPanel is also floating
  const paramFloatingOpen = isParamPanelOpen && paramPanelMode === 'floating';
  const rightOffset = paramFloatingOpen ? paramPanelWidth : 0;

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
