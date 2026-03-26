/**
 * Operator commands: CRUD + lifecycle for Operators (formerly ExpressionTags).
 *
 * op.add / op.remove / op.edit are the primary command interface.
 * All operations go through ExpressionTagRegistry only — no dual writes.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { EasingType } from '../../engine/expression/types';

const VALID_EASINGS = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'] as const;

const NoParams = z.object({}).describe('none');

const IdParams = z.object({
  id: z.string(),
}).describe('{ id: string }');

const SetPhaseParams = z.object({
  id: z.string(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule', 'interaction']),
}).describe('{ id: string, phase: "pre-rule" | "rule" | "post-rule" }');

const CopyParams = z.object({
  id: z.string(),
  ownerType: z.enum(['cell-type', 'environment', 'global', 'root']),
  ownerId: z.string().optional(),
}).describe('{ id: string, ownerType: string, [ownerId]: string }');

const AddParams = z.object({
  source: z.enum(['code', 'link', 'script']), // 'link' accepted but creates 'code' op with linkMeta
  name: z.string().optional(),
  code: z.string().optional(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule', 'interaction']).optional(),
  owner: z.object({ type: z.enum(['cell-type', 'environment', 'global', 'root']), id: z.string().optional() }).optional(),
  // code source
  property: z.string().optional(),
  // link wizard metadata (produces code op with linkMeta for JS fast-path)
  linkMeta: z.object({
    sourceAddress: z.string(),
    sourceRange: z.tuple([z.number(), z.number()]),
    targetRange: z.tuple([z.number(), z.number()]),
    easing: z.enum(VALID_EASINGS),
  }).optional(),
  // link source (legacy, also used for link wizard passthrough)
  sourceAddress: z.string().optional(),
  targetAddress: z.string().optional(),
  sourceRange: z.tuple([z.number(), z.number()]).optional(),
  targetRange: z.tuple([z.number(), z.number()]).optional(),
  easing: z.enum(VALID_EASINGS).optional(),
  // script source
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
}).describe('{ source: "code"|"link"|"script", ... }');

const EditParams = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string().optional(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule', 'interaction']).optional(),
  sourceRange: z.tuple([z.number(), z.number()]).optional(),
  targetRange: z.tuple([z.number(), z.number()]).optional(),
  easing: z.enum(VALID_EASINGS).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  nodeGraph: z.object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
  }).optional(),
}).describe('{ id: string, [code], [name], [phase], [nodeGraph], ... }');

export function registerOpCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'op.list',
    description: 'List all operators',
    category: 'op',
    params: NoParams,
    execute: async () => {
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: true, data: { tags: [] } };
      }
      const tags = tagRegistry.getAll().map((t) => ({
        id: t.id,
        name: t.name,
        source: t.source,
        phase: t.phase,
        enabled: t.enabled,
        owner: t.owner,
        inputs: t.inputs,
        outputs: t.outputs,
        ...(t.linkMeta ? { linkMeta: t.linkMeta } : {}),
      }));
      return { success: true, data: { tags } };
    },
  });

  registry.register({
    name: 'op.show',
    description: 'Show full details of an operator',
    category: 'op',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Op "${id}" not found` };
      }
      return { success: true, data: tag };
    },
  });

  registry.register({
    name: 'op.setPhase',
    description: 'Change evaluation phase of an operator',
    category: 'op',
    params: SetPhaseParams,
    execute: async (params) => {
      const { id, phase } = params as z.infer<typeof SetPhaseParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const updated = tagRegistry.update(id, { phase });
      if (!updated) {
        return { success: false, error: `Op "${id}" not found` };
      }
      eventBus.emit('tag:updated', { id, phase });
      controller.onTagChanged();
      return { success: true, data: { id, phase } };
    },
  });

  registry.register({
    name: 'op.copy',
    description: 'Copy an operator to a new owner',
    category: 'op',
    params: CopyParams,
    execute: async (params) => {
      const { id, ownerType, ownerId } = params as z.infer<typeof CopyParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      try {
        const copy = tagRegistry.copyToOwner(id, {
          type: ownerType,
          id: ownerId,
        });
        eventBus.emit('tag:added', copy);
        controller.onTagChanged();
        return { success: true, data: copy };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  /**
   * Sync the GPU runner's internal pass/stage enabled state to match a tag.
   *
   * Tag names are decorated (e.g. "Fire – vorticity_apply Rule") but the
   * runner's internal stage/pass names are raw (e.g. "vorticity_apply").
   * We try exact match first, then substring match.
   */
  const syncRunnerEnabled = (tag: { name: string; phase: string }, enabled: boolean) => {
    const runner = controller.getGPURuleRunner();
    if (!runner) return;
    const order = runner.getExecutionOrder();

    if (tag.phase === 'rule') {
      // Find the matching rule stage by checking if its sourceId is contained in the tag name
      const match = order.find(
        (e) => e.type === 'rule-stage' && e.sourceId && tag.name.includes(e.sourceId),
      );
      if (match?.sourceId) {
        runner.setStageEnabled(match.sourceId, enabled);
      }
    } else {
      // For pre-rule/post-rule ops, the pass name matches the tag name or sourceId
      const match = order.find(
        (e) => (e.type === 'pre-rule-op' || e.type === 'post-rule-op') &&
               e.sourceId && (e.sourceId === tag.name || tag.name.includes(e.sourceId)),
      );
      if (match?.sourceId) {
        runner.setPassEnabled(match.sourceId, enabled);
      }
    }
  };

  registry.register({
    name: 'op.enable',
    description: 'Enable an operator',
    category: 'op',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Op "${id}" not found` };
      }
      tagRegistry.enable(id);
      syncRunnerEnabled(tag, true);
      eventBus.emit('tag:updated', { id, enabled: true });
      return { success: true, data: { id, enabled: true } };
    },
  });

  registry.register({
    name: 'op.disable',
    description: 'Disable an operator',
    category: 'op',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Op "${id}" not found` };
      }
      tagRegistry.disable(id);
      syncRunnerEnabled(tag, false);
      eventBus.emit('tag:updated', { id, enabled: false });
      return { success: true, data: { id, enabled: false } };
    },
  });

  // --- CRUD commands ---

  registry.register({
    name: 'op.add',
    description: 'Create a new operator (expression, link, or script)',
    category: 'op',
    params: AddParams,
    execute: async (params) => {
      const p = params as z.infer<typeof AddParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }

      try {
        if (p.source === 'code') {
          const property = p.property;
          if (!property) {
            return { success: false, error: 'property is required for code operators' };
          }
          const code = p.code ?? '';

          // If linkMeta is provided, this is a link-wizard-generated code op.
          if (p.linkMeta) {
            const srcAddr = p.sourceAddress ?? p.linkMeta.sourceAddress;
            const tgtAddr = p.targetAddress ?? `cell.${property}`;

            const tag = tagRegistry.addFromLink(
              srcAddr,
              tgtAddr,
              p.linkMeta.sourceRange,
              p.linkMeta.targetRange,
              p.linkMeta.easing as EasingType,
              true,
            );
            if (p.phase) tagRegistry.update(tag.id, { phase: p.phase });
            if (p.owner) tagRegistry.update(tag.id, { owner: p.owner });
            eventBus.emit('tag:added', tag);
            controller.onLinkChanged();
            return { success: true, data: tag };
          }

          // Standard code expression op (no linkMeta)
          // Ensure Pyodide bridge exists for expression evaluation
          controller.ensurePyodideBridge();

          // Remove existing op for this property
          const existing = tagRegistry.getAll().find(
            (t) => t.source === 'code' && t.outputs.includes(`cell.${property}`),
          );
          if (existing) {
            tagRegistry.remove(existing.id);
            eventBus.emit('tag:removed', { id: existing.id });
          }

          const tag = tagRegistry.addFromExpression(property, code);
          if (p.phase) tagRegistry.update(tag.id, { phase: p.phase });
          if (p.owner) tagRegistry.update(tag.id, { owner: p.owner });
          eventBus.emit('tag:added', tag);
          controller.onTagChanged();
          return { success: true, data: tag };

        } else if (p.source === 'link') {
          const sourceAddress = p.sourceAddress;
          const targetAddress = p.targetAddress;
          if (!sourceAddress || !targetAddress) {
            return { success: false, error: 'sourceAddress and targetAddress required for link operators' };
          }

          const sourceRange = p.sourceRange ?? [0, 1] as [number, number];
          const targetRange = p.targetRange ?? [0, 1] as [number, number];
          const easing = p.easing ?? 'linear';

          const tag = tagRegistry.addFromLink(sourceAddress, targetAddress, sourceRange, targetRange, easing as EasingType, true);
          if (p.phase) tagRegistry.update(tag.id, { phase: p.phase });
          if (p.owner) tagRegistry.update(tag.id, { owner: p.owner });
          eventBus.emit('tag:added', tag);
          controller.onLinkChanged();
          return { success: true, data: tag };

        } else if (p.source === 'script') {
          const name = p.name ?? 'untitled';
          const code = p.code ?? '';

          // Ensure Pyodide bridge exists for script evaluation
          controller.ensurePyodideBridge();

          // Remove existing op for this script
          const existing = tagRegistry.getAll().find(
            (t) => t.source === 'script' && t.name === name,
          );
          if (existing) {
            tagRegistry.remove(existing.id);
            eventBus.emit('tag:removed', { id: existing.id });
          }

          const tag = tagRegistry.addFromScript(name, code, p.inputs ?? [], p.outputs ?? [], true);
          if (p.phase) tagRegistry.update(tag.id, { phase: p.phase });
          if (p.owner) tagRegistry.update(tag.id, { owner: p.owner });
          eventBus.emit('tag:added', tag);
          controller.onTagChanged();
          return { success: true, data: tag };

        } else {
          return { success: false, error: `Unknown source: "${p.source}"` };
        }
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });

  registry.register({
    name: 'op.remove',
    description: 'Remove an operator',
    category: 'op',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Op "${id}" not found` };
      }

      const wasEnabled = tag.enabled;
      tagRegistry.remove(id);
      eventBus.emit('tag:removed', { id });
      // Only invalidate if the removed op was actually enabled (affecting output)
      if (wasEnabled) {
        controller.onTagChanged();
      }
      return { success: true, data: { id } };
    },
  });

  registry.register({
    name: 'op.edit',
    description: 'Edit an operator\'s code, phase, ranges, or other properties',
    category: 'op',
    params: EditParams,
    execute: async (params) => {
      const p = params as z.infer<typeof EditParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(p.id);
      if (!tag) {
        return { success: false, error: `Op "${p.id}" not found` };
      }

      // Build patch for the op
      const patch: Record<string, unknown> = {};
      if (p.code !== undefined) patch.code = p.code;
      if (p.name !== undefined) patch.name = p.name;
      if (p.phase !== undefined) patch.phase = p.phase;
      if (p.inputs !== undefined) patch.inputs = p.inputs;
      if (p.outputs !== undefined) patch.outputs = p.outputs;
      if (p.nodeGraph !== undefined) patch.nodeGraph = p.nodeGraph;

      // Update linkMeta if link-related fields are changed
      if (tag.linkMeta && (p.sourceRange || p.targetRange || p.easing)) {
        patch.linkMeta = {
          ...tag.linkMeta,
          ...(p.sourceRange ? { sourceRange: p.sourceRange } : {}),
          ...(p.targetRange ? { targetRange: p.targetRange } : {}),
          ...(p.easing ? { easing: p.easing as EasingType } : {}),
        };
      }

      const updated = tagRegistry.update(p.id, patch as Parameters<typeof tagRegistry.update>[1]);
      if (!updated) {
        return { success: false, error: `Failed to update op "${p.id}"` };
      }
      eventBus.emit('tag:updated', { id: p.id, ...patch });

      // Only invalidate cache if the op is enabled AND output-affecting fields changed
      const affectsOutput = p.code !== undefined || p.phase !== undefined
        || p.inputs !== undefined || p.outputs !== undefined
        || p.nodeGraph !== undefined;
      if (updated.enabled && affectsOutput) {
        controller.onTagChanged();
      }
      return { success: true, data: updated };
    },
  });
}
