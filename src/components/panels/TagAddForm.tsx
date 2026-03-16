'use client';

import { useState, useCallback } from 'react';
import { commandRegistry } from '@/commands/CommandRegistry';
import { useSimStore } from '@/store/simStore';
import type { ExpressionSource } from '@/engine/expression/types';
import { generateLinkCode } from '@/engine/expression/linkCodegen';

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s);
  return isNaN(n) ? fallback : n;
}

const EASING_OPTIONS = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'] as const;

/** UI tabs for creation wizard. 'link' is a wizard that produces code tags. */
const SOURCE_BUTTONS: { value: ExpressionSource; label: string; icon: string }[] = [
  { value: 'code', label: 'Expr', icon: '\u0192' },
  { value: 'link', label: 'Link', icon: '\u21C4' },
  { value: 'script', label: 'Script', icon: '\u26A1' },
];

interface TagAddFormProps {
  onClose: () => void;
  defaultSource?: 'code' | 'link' | 'script';
  defaultTarget?: string;
}

export function TagAddForm({ onClose, defaultSource = 'code', defaultTarget = '' }: TagAddFormProps) {
  const cellProperties = useSimStore((s) => s.cellProperties);

  // Source type
  const [source, setSource] = useState<ExpressionSource>(defaultSource);

  // Expression fields
  const defaultPropName = defaultTarget.startsWith('cell.') ? defaultTarget.slice(5) : defaultTarget;
  const [exprProperty, setExprProperty] = useState(defaultPropName || (cellProperties[0]?.name ?? ''));
  const [exprCode, setExprCode] = useState('');

  // Link fields
  const [linkSource, setLinkSource] = useState('');
  const [linkTarget, setLinkTarget] = useState(defaultTarget || '');
  const [srcMin, setSrcMin] = useState('0');
  const [srcMax, setSrcMax] = useState('1');
  const [tgtMin, setTgtMin] = useState('0');
  const [tgtMax, setTgtMax] = useState('1');
  const [easing, setEasing] = useState<(typeof EASING_OPTIONS)[number]>('linear');

  // Script fields
  const [scriptName, setScriptName] = useState('');
  const [scriptCode, setScriptCode] = useState('');
  const [scriptInputs, setScriptInputs] = useState('');
  const [scriptOutputs, setScriptOutputs] = useState('');

  const handleSubmit = useCallback(() => {
    if (source === 'code') {
      commandRegistry.execute('tag.add', {
        source: 'code',
        property: exprProperty,
        code: exprCode,
        phase: 'post-rule',
      });
    } else if (source === 'link') {
      // Link wizard: generates a code tag with rangeMap() expression + linkMeta for fast-path
      const sRange: [number, number] = [parseNum(srcMin, 0), parseNum(srcMax, 1)];
      const tRange: [number, number] = [parseNum(tgtMin, 0), parseNum(tgtMax, 1)];
      const linkMeta = {
        sourceAddress: linkSource,
        sourceRange: sRange,
        targetRange: tRange,
        easing,
      };
      const code = generateLinkCode(linkMeta, linkTarget);
      // Extract target property name from address (e.g. "cell.alpha" → "alpha")
      const targetProp = linkTarget.startsWith('cell.') ? linkTarget.slice(5) : linkTarget;
      commandRegistry.execute('tag.add', {
        source: 'code',
        property: targetProp,
        code,
        phase: 'pre-rule',
        linkMeta,
        sourceAddress: linkSource,
        targetAddress: linkTarget,
      });
    } else if (source === 'script') {
      const inputs = scriptInputs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const outputs = scriptOutputs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      commandRegistry.execute('tag.add', {
        source: 'script',
        name: scriptName || 'untitled',
        code: scriptCode,
        inputs,
        outputs,
        phase: 'post-rule',
      });
    }
    onClose();
  }, [
    source,
    exprProperty,
    exprCode,
    linkSource,
    linkTarget,
    srcMin,
    srcMax,
    tgtMin,
    tgtMax,
    easing,
    scriptName,
    scriptCode,
    scriptInputs,
    scriptOutputs,
    onClose,
  ]);

  return (
    <div
      className="bg-zinc-900 border border-zinc-700 rounded p-2 space-y-2 mb-2"
      data-testid="tag-add-form"
    >
      {/* Source type selector — compact icon+label */}
      <div className="flex rounded overflow-hidden border border-zinc-700" data-testid="tag-add-source-selector">
        {SOURCE_BUTTONS.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setSource(btn.value)}
            className={`flex-1 text-[10px] font-mono py-1 transition-colors cursor-pointer ${
              source === btn.value
                ? 'bg-green-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
            }`}
          >
            {btn.icon} {btn.label}
          </button>
        ))}
      </div>

      {/* Expression fields */}
      {source === 'code' && (
        <div className="space-y-1.5">
          <select
            value={exprProperty}
            onChange={(e) => setExprProperty(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
          >
            {cellProperties.map((prop) => (
              <option key={prop.name} value={prop.name}>
                {prop.name}
              </option>
            ))}
          </select>
          <textarea
            value={exprCode}
            onChange={(e) => setExprCode(e.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none resize-y"
            placeholder="e.g. age / 100"
          />
          <div className="text-[10px] font-mono text-zinc-600">Phase: post-rule</div>
        </div>
      )}

      {/* Link fields */}
      {source === 'link' && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={linkSource}
            onChange={(e) => setLinkSource(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
            placeholder="source: cell.age"
          />
          <input
            type="text"
            value={linkTarget}
            onChange={(e) => setLinkTarget(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
            placeholder="target: cell.alpha"
          />
          <div className="flex gap-1">
            <input
              type="text"
              value={srcMin}
              onChange={(e) => setSrcMin(e.target.value)}
              className="w-1/4 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-1.5 py-1 border border-zinc-700 outline-none"
              placeholder="s.min"
            />
            <input
              type="text"
              value={srcMax}
              onChange={(e) => setSrcMax(e.target.value)}
              className="w-1/4 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-1.5 py-1 border border-zinc-700 outline-none"
              placeholder="s.max"
            />
            <input
              type="text"
              value={tgtMin}
              onChange={(e) => setTgtMin(e.target.value)}
              className="w-1/4 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-1.5 py-1 border border-zinc-700 outline-none"
              placeholder="t.min"
            />
            <input
              type="text"
              value={tgtMax}
              onChange={(e) => setTgtMax(e.target.value)}
              className="w-1/4 bg-zinc-800 text-zinc-200 text-xs font-mono tabular-nums rounded px-1.5 py-1 border border-zinc-700 outline-none"
              placeholder="t.max"
            />
          </div>
          <select
            value={easing}
            onChange={(e) => setEasing(e.target.value as (typeof EASING_OPTIONS)[number])}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
          >
            {EASING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <div className="text-[10px] font-mono text-zinc-600">Phase: pre-rule</div>
        </div>
      )}

      {/* Script fields */}
      {source === 'script' && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
            placeholder="name"
          />
          <textarea
            value={scriptCode}
            onChange={(e) => setScriptCode(e.target.value)}
            rows={3}
            spellCheck={false}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none resize-y"
            placeholder="Python code..."
          />
          <input
            type="text"
            value={scriptInputs}
            onChange={(e) => setScriptInputs(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
            placeholder="inputs: cell.age, env.feedRate"
          />
          <input
            type="text"
            value={scriptOutputs}
            onChange={(e) => setScriptOutputs(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 outline-none"
            placeholder="outputs: cell.alpha"
          />
          <div className="text-[10px] font-mono text-zinc-600">Phase: post-rule</div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-1.5">
        <button
          onClick={onClose}
          className="text-xs font-mono text-zinc-500 hover:text-zinc-300 px-2 py-1 cursor-pointer"
          data-testid="tag-add-cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="text-xs font-mono bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded cursor-pointer"
          data-testid="tag-add-submit"
        >
          Add
        </button>
      </div>
    </div>
  );
}
