/**
 * CodePreview: read-only monospace Python code display.
 *
 * Shows the compiled output from the node graph, updating live.
 */

'use client';

interface CodePreviewProps {
  code: string;
}

export function CodePreview({ code }: CodePreviewProps) {
  const lines = code.split('\n').filter((l) => !l.startsWith('# @nodegraph:'));

  return (
    <div className="h-full bg-zinc-950 overflow-auto">
      <div className="px-3 py-2">
        <pre className="text-xs font-mono text-zinc-400 whitespace-pre leading-5">
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="text-zinc-700 w-6 text-right mr-3 select-none shrink-0 tabular-nums">
                {i + 1}
              </span>
              <span className={line.startsWith('#') ? 'text-zinc-600' : 'text-zinc-300'}>
                {line || '\u00A0'}
              </span>
            </div>
          ))}
          {lines.length === 0 && (
            <span className="text-zinc-600 italic">No code generated</span>
          )}
        </pre>
      </div>
    </div>
  );
}
