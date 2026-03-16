'use client';

import { useState, useCallback, useMemo } from 'react';
import { useExpressionStore } from '@/store/expressionStore';
import { useSimStore } from '@/store/simStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import { TagRow } from './TagRow';
import { TagAddForm } from './TagAddForm';
import type { ExpressionTag, ExpressionSource } from '@/engine/expression/types';

/* ------------------------------------------------------------------ */
/*  Section wrapper (matches ScriptPanel style)                       */
/* ------------------------------------------------------------------ */

function Section({
  title,
  defaultOpen = true,
  children,
  actions,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
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
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Owner helpers                                                     */
/* ------------------------------------------------------------------ */

function ownerKey(owner: { type: string; id?: string }): string {
  if (owner.type === 'cell-type' && owner.id) return `cell-type:${owner.id}`;
  return owner.type;
}

function ownerLabel(
  key: string,
  cellTypes: Array<{ name: string }>,
): string {
  if (key === 'root') return 'Root';
  if (key === 'environment') return 'Environment';
  if (key === 'global') return 'Global';
  if (key.startsWith('cell-type:')) {
    const id = key.slice('cell-type:'.length);
    const ct = cellTypes.find((c) => c.name === id);
    return `Cell: ${ct?.name ?? id}`;
  }
  if (key === 'cell-type') return 'Cell: (default)';
  return key;
}

/* ------------------------------------------------------------------ */
/*  Source filter toggle button                                       */
/* ------------------------------------------------------------------ */

/** Two primary categories: expressions (code + link-wizard) and scripts.
 * Tags with linkMeta get a small link indicator but aren't a separate category. */
const SOURCE_FILTERS: Record<string, {
  label: string;
  activeClass: string;
  testId: string;
  /** Which source values this filter matches */
  sources: ExpressionSource[];
}> = {
  expr: { label: '\u0192 Expr', activeClass: 'bg-green-400/20 text-green-400', testId: 'tag-filter-expr', sources: ['code', 'link'] },
  script: { label: '\u26A1 Script', activeClass: 'bg-amber-400/20 text-amber-400', testId: 'tag-filter-script', sources: ['script'] },
};

function FilterButton({
  filterKey,
  active,
  onToggle,
}: {
  filterKey: string;
  active: boolean;
  onToggle: () => void;
}) {
  const cfg = SOURCE_FILTERS[filterKey];
  if (!cfg) return null;
  return (
    <button
      data-testid={cfg.testId}
      onClick={onToggle}
      className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${active ? cfg.activeClass : 'bg-zinc-800 text-zinc-600'}`}
      title={`Filter ${filterKey} tags`}
    >
      {cfg.label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Group header                                                      */
/* ------------------------------------------------------------------ */

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 mt-2 mb-1">
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UnifiedTagsSection                                                */
/* ------------------------------------------------------------------ */

export function UnifiedTagsSection() {
  const tags = useExpressionStore((s) => s.tags);
  const cellTypes = useSimStore((s) => s.cellTypes);

  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryFilters, setCategoryFilters] = useState<Record<string, boolean>>({
    expr: true,
    script: true,
  });

  const toggleFilter = useCallback((key: string) => {
    setCategoryFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* Filter tags by active category toggles */
  const filteredTags = useMemo(
    () => tags.filter((t) => {
      for (const [key, cfg] of Object.entries(SOURCE_FILTERS)) {
        if (categoryFilters[key] && cfg.sources.includes(t.source)) return true;
      }
      return false;
    }),
    [tags, categoryFilters],
  );

  /* Group filtered tags by owner */
  const grouped = useMemo(() => {
    const groups = new Map<string, ExpressionTag[]>();
    for (const tag of filteredTags) {
      const key = ownerKey(tag.owner);
      const arr = groups.get(key);
      if (arr) {
        arr.push(tag);
      } else {
        groups.set(key, [tag]);
      }
    }
    return groups;
  }, [filteredTags]);

  /* Clear all visible tags */
  const handleClearAll = useCallback(() => {
    for (const tag of filteredTags) {
      commandRegistry.execute('tag.remove', { id: tag.id });
    }
  }, [filteredTags]);

  /* Stable ordering of group keys: root first, then global, environment, cell-types */
  const sortedKeys = useMemo(() => {
    const keys = Array.from(grouped.keys());
    const order: Record<string, number> = { root: 0, global: 1, environment: 2 };
    return keys.sort((a, b) => {
      const oa = order[a] ?? 3;
      const ob = order[b] ?? 3;
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }, [grouped]);

  const actions = (
    <>
      <FilterButton filterKey="expr" active={categoryFilters.expr} onToggle={() => toggleFilter('expr')} />
      <FilterButton filterKey="script" active={categoryFilters.script} onToggle={() => toggleFilter('script')} />
      <button
        data-testid="tag-add-btn"
        onClick={() => setShowAddForm((v) => !v)}
        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
        title="Add tag"
      >
        +
      </button>
      <button
        data-testid="tag-clear-btn"
        onClick={handleClearAll}
        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-red-400 cursor-pointer"
        title="Clear all visible tags"
      >
        Clear
      </button>
    </>
  );

  return (
    <div data-testid="unified-tags-section">
      <Section title="Tags" actions={actions}>
        {showAddForm && <TagAddForm onClose={() => setShowAddForm(false)} />}

        {sortedKeys.length === 0 && (
          <div className="text-xs text-zinc-600 italic py-2">
            No tags. Use + to add one.
          </div>
        )}

        {sortedKeys.map((key) => {
          const groupTags = grouped.get(key)!;
          return (
            <div key={key}>
              <GroupHeader label={ownerLabel(key, cellTypes)} />
              {groupTags.map((tag) => (
                <TagRow key={tag.id} tag={tag} />
              ))}
            </div>
          );
        })}
      </Section>
    </div>
  );
}
