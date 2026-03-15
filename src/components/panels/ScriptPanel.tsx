/**
 * ScriptPanel: UI for editing global variables, per-property expressions, and global scripts.
 *
 * Three collapsible sections. Shows Pyodide loading progress when applicable.
 * Supports floating (overlay) and docked (flex sibling) modes, matching ParamPanel pattern.
 */

'use client';

import { useState, useCallback } from 'react';
import { useScriptStore } from '@/store/scriptStore';
import { useLinkStore } from '@/store/linkStore';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-700/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-300"
      >
        <span>{title}</span>
        <span className="text-zinc-500">{open ? '\u25B4' : '\u25BE'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

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

function VariablesSection() {
  const variables = useScriptStore((s) => s.globalVariables);
  const entries = Object.entries(variables);

  return (
    <Section title="Variables">
      {entries.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No global variables</div>
      ) : (
        <div className="space-y-1">
          {entries.map(([name, { value, type }]) => (
            <div
              key={name}
              className="flex items-center justify-between text-xs font-mono"
            >
              <span className="text-zinc-300 truncate">{name}</span>
              <span className="text-green-400 tabular-nums">
                {typeof value === 'number' ? value.toFixed(type === 'int' ? 0 : 3) : String(value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ExpressionsSection() {
  const expressions = useScriptStore((s) => s.expressions);
  const entries = Object.entries(expressions);

  return (
    <Section title="Expressions">
      {entries.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No active expressions</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([prop, expr]) => (
            <div key={prop}>
              <div className="text-xs text-zinc-400 mb-0.5">{prop}</div>
              <div className="text-xs font-mono text-green-400 bg-zinc-800 rounded px-2 py-1 break-all">
                {expr}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function LinksSection() {
  const links = useLinkStore((s) => s.links);

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    const cmd = enabled ? 'link.disable' : 'link.enable';
    commandRegistry.execute(cmd, { id });
  }, []);

  const handleRemove = useCallback((id: string) => {
    commandRegistry.execute('link.remove', { id });
  }, []);

  return (
    <Section title="Links">
      {links.length === 0 ? (
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
                  >
                    {link.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => handleRemove(link.id)}
                    className="text-zinc-500 hover:text-red-400 text-xs cursor-pointer"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              </div>
              <div className="text-[10px] font-mono text-zinc-500">
                [{link.sourceRange.join(', ')}] → [{link.targetRange.join(', ')}] · {link.easing}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ScriptsSection() {
  const scripts = useScriptStore((s) => s.globalScripts);

  return (
    <Section title="Scripts">
      {scripts.length === 0 ? (
        <div className="text-xs text-zinc-500 italic">No global scripts</div>
      ) : (
        <div className="space-y-2">
          {scripts.map((script) => (
            <div key={script.name} className="bg-zinc-800 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-zinc-300">{script.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    script.enabled
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-zinc-700 text-zinc-500'
                  }`}
                >
                  {script.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <pre className="text-[11px] font-mono text-zinc-400 whitespace-pre-wrap break-all max-h-24 overflow-auto">
                {script.code}
              </pre>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

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
