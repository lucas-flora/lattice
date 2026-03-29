/**
 * Pipeline commands: introspection and reordering of the tick execution pipeline.
 *
 * pipeline.showCode — generate a combined code view of the entire tick pipeline.
 * op.reorder       — reorder an op or rule stage within its pipeline phase.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { PipelineEntry } from '../../engine/rule/GPURuleRunner';
import { expressionStoreActions } from '../../store/expressionStore';

/** Metadata for a section in the combined pipeline code view */
export interface PipelineSectionMeta {
  /** Pipeline entry ID for navigation */
  entryId: string;
  /** Display label, e.g. "RULE STAGE 1 — advection" */
  label: string;
  /** 0-based line number where this section starts */
  lineStart: number;
  /** 0-based line number where this section ends (exclusive) */
  lineEnd: number;
}

const SEPARATOR = '# ═══════════════════════════════════════════';

/** Build a section label from an entry */
function buildLabel(entry: PipelineEntry, indexInPhase: number): string {
  switch (entry.type) {
    case 'rule-stage':
      return `RULE STAGE ${indexInPhase + 1} — ${entry.name}`;
    case 'pre-rule-op':
      return `PRE-RULE OP — ${entry.name}`;
    case 'post-rule-op':
      return `OP — ${entry.name}`;
    default:
      return entry.name;
  }
}

/** Build the execution context tag */
function contextTag(entry: PipelineEntry): string {
  if (!entry.enabled) return 'DISABLED';
  return entry.executionContext.toUpperCase();
}

/** Get the source code for a pipeline entry from the preset config */
function getEntryCode(
  entry: PipelineEntry,
  controller: SimulationController,
): string {
  const runner = controller.getGPURuleRunner();
  if (!runner) return '# (no runner)';
  const preset = runner.getPreset();

  switch (entry.type) {
    case 'rule-stage': {
      if (preset.rule.stages) {
        const stage = preset.rule.stages.find((s) => s.name === entry.sourceId);
        return stage?.compute?.trim() ?? '# (no compute body)';
      }
      return preset.rule.compute?.trim() ?? '# (no compute body)';
    }
    case 'pre-rule-op':
    case 'post-rule-op': {
      // Look up in expression_tags from preset config
      const tags = preset.expression_tags;
      if (tags) {
        const tag = tags.find((t) => t.name === entry.sourceId);
        if (tag) return tag.code.trim();
      }
      // Fallback: try the tag registry
      const tagRegistry = controller.getTagRegistry();
      if (tagRegistry) {
        const allTags = tagRegistry.getAll();
        const tag = allTags.find(
          (t) => t.name === entry.sourceId || t.name.includes(entry.sourceId ?? ''),
        );
        if (tag) return tag.code.trim();
      }
      return '# (no source)';
    }
    default:
      return '# (unknown entry type)';
  }
}

const NoParams = z.object({}).describe('none');

const ReorderParams = z.object({
  id: z.string().describe('Pipeline entry ID or op sourceId'),
  newIndex: z.number().int().min(0).describe('New 0-based position within its phase'),
}).describe('{ id: string, newIndex: number }');

export function registerPipelineCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  // ── pipeline.showCode ──────────────────────────────────────────────
  registry.register({
    name: 'pipeline.showCode',
    description: 'Show the entire tick pipeline as a single combined script',
    category: 'pipeline',
    params: NoParams,
    execute: async () => {
      const runner = controller.getGPURuleRunner();
      if (!runner) {
        return { success: false, error: 'No GPU rule runner active' };
      }

      const entries = runner.getExecutionOrder();
      const lines: string[] = [];
      const sections: PipelineSectionMeta[] = [];

      // Track index within each phase for labeling
      const phaseCounters: Record<string, number> = {};

      for (const entry of entries) {
        const phase = entry.phase;
        phaseCounters[phase] = (phaseCounters[phase] ?? 0);
        const indexInPhase = phaseCounters[phase];
        phaseCounters[phase]++;

        const label = buildLabel(entry, indexInPhase);
        const tag = contextTag(entry);
        const code = getEntryCode(entry, controller);

        const sectionStart = lines.length;

        // Section header
        lines.push(SEPARATOR);
        const headerLine = `# ${label}`;
        const pad = Math.max(1, 45 - headerLine.length);
        lines.push(`${headerLine}${' '.repeat(pad)}[${tag}]`);
        lines.push(SEPARATOR);

        // Code body
        if (!entry.enabled) {
          // Disabled: comment out each line
          for (const codeLine of code.split('\n')) {
            lines.push(`# ${codeLine}`);
          }
        } else {
          for (const codeLine of code.split('\n')) {
            lines.push(codeLine);
          }
        }

        // Blank line between sections
        lines.push('');

        sections.push({
          entryId: entry.id,
          label,
          lineStart: sectionStart,
          lineEnd: lines.length,
        });
      }

      return {
        success: true,
        data: {
          code: lines.join('\n'),
          sections,
        },
      };
    },
  });

  // ── op.reorder ─────────────────────────────────────────────────────
  registry.register({
    name: 'op.reorder',
    description: 'Reorder an operator or rule stage within its pipeline phase',
    category: 'op',
    params: ReorderParams,
    execute: async (params) => {
      const { id, newIndex } = params as z.infer<typeof ReorderParams>;
      const runner = controller.getGPURuleRunner();
      if (!runner) {
        return { success: false, error: 'No GPU rule runner active' };
      }

      const entries = runner.getExecutionOrder();
      const entry = entries.find((e) => e.id === id || e.sourceId === id);
      if (!entry) {
        return { success: false, error: `Pipeline entry "${id}" not found` };
      }

      const phase = entry.phase;

      // Find the expression store tag ID for syncing the UI store
      const findStoreTagId = (): string | null => {
        const tagRegistry = controller.getTagRegistry();
        if (!tagRegistry) return null;
        const allTags = tagRegistry.getAll();
        const match = allTags.find(
          (t) => t.name === entry.sourceId || t.name.includes(entry.sourceId ?? ''),
        );
        return match?.id ?? null;
      };

      if (entry.type === 'rule-stage') {
        const changed = runner.reorderStage(entry.sourceId!, newIndex);
        if (!changed) {
          return { success: true, data: { id, newIndex, changed: false } };
        }
        // Sync expression store (rule tags)
        const storeId = findStoreTagId();
        if (storeId) expressionStoreActions.reorderTag(storeId, newIndex);
        eventBus.emit('pipeline:reordered', { id, phase, newIndex });
        return { success: true, data: { id, newIndex, changed: true } };
      }

      if (entry.type === 'post-rule-op') {
        const changed = runner.reorderPass(entry.sourceId!, newIndex);
        if (!changed) {
          return { success: true, data: { id, newIndex, changed: false } };
        }
        // Sync expression store
        const storeId = findStoreTagId();
        if (storeId) expressionStoreActions.reorderTag(storeId, newIndex);
        eventBus.emit('pipeline:reordered', { id, phase, newIndex });
        return { success: true, data: { id, newIndex, changed: true } };
      }

      // Pre-rule ops run on CPU in preset tag order — reorder the preset array
      if (entry.type === 'pre-rule-op') {
        const preset = runner.getPreset();
        const tags = preset.expression_tags;
        if (!tags) {
          return { success: false, error: 'No expression tags in preset' };
        }
        const phaseIndices: number[] = [];
        for (let i = 0; i < tags.length; i++) {
          if (tags[i].phase === 'pre-rule') phaseIndices.push(i);
        }
        const curLocal = phaseIndices.findIndex((gi) => tags[gi].name === entry.sourceId);
        if (curLocal < 0 || newIndex < 0 || newIndex >= phaseIndices.length || curLocal === newIndex) {
          return { success: true, data: { id, newIndex, changed: false } };
        }
        const globalIdx = phaseIndices[curLocal];
        const [moved] = tags.splice(globalIdx, 1);
        // Recompute after removal
        const updated: number[] = [];
        for (let i = 0; i < tags.length; i++) {
          if (tags[i].phase === 'pre-rule') updated.push(i);
        }
        const insertAt = newIndex < updated.length
          ? updated[newIndex]
          : (updated.length > 0 ? updated[updated.length - 1] + 1 : tags.length);
        tags.splice(insertAt, 0, moved);
        // Sync expression store
        const storeId = findStoreTagId();
        if (storeId) expressionStoreActions.reorderTag(storeId, newIndex);
        eventBus.emit('pipeline:reordered', { id, phase, newIndex });
        return { success: true, data: { id, newIndex, changed: true } };
      }

      return { success: false, error: 'Visual mappings cannot be reordered' };
    },
  });
}
