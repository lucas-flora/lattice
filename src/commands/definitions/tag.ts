/**
 * Tag commands: CRUD + lifecycle for ExpressionTags.
 *
 * tag.add / tag.remove / tag.edit are the primary command interface.
 * Legacy commands (link.add, expr.set, script.add) remain as sugar.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import type { EasingType } from '../../engine/linking/types';

const VALID_EASINGS = ['linear', 'smoothstep', 'easeIn', 'easeOut', 'easeInOut'] as const;

const NoParams = z.object({}).describe('none');

const IdParams = z.object({
  id: z.string(),
}).describe('{ id: string }');

const SetPhaseParams = z.object({
  id: z.string(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule']),
}).describe('{ id: string, phase: "pre-rule" | "rule" | "post-rule" }');

const CopyParams = z.object({
  id: z.string(),
  ownerType: z.enum(['cell-type', 'environment', 'global', 'root']),
  ownerId: z.string().optional(),
}).describe('{ id: string, ownerType: string, [ownerId]: string }');

const AddParams = z.object({
  source: z.enum(['code', 'link', 'script']), // 'link' accepted but creates 'code' tag with linkMeta
  name: z.string().optional(),
  code: z.string().optional(),
  phase: z.enum(['pre-rule', 'rule', 'post-rule']).optional(),
  owner: z.object({ type: z.enum(['cell-type', 'environment', 'global', 'root']), id: z.string().optional() }).optional(),
  // code source
  property: z.string().optional(),
  // link wizard metadata (produces code tag with linkMeta for JS fast-path)
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
  phase: z.enum(['pre-rule', 'rule', 'post-rule']).optional(),
  sourceRange: z.tuple([z.number(), z.number()]).optional(),
  targetRange: z.tuple([z.number(), z.number()]).optional(),
  easing: z.enum(VALID_EASINGS).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
}).describe('{ id: string, [code], [name], [phase], ... }');

export function registerTagCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registry.register({
    name: 'tag.list',
    description: 'List all expression tags',
    category: 'tag',
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
    name: 'tag.show',
    description: 'Show full details of an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      return { success: true, data: tag };
    },
  });

  registry.register({
    name: 'tag.setPhase',
    description: 'Change evaluation phase of a tag',
    category: 'tag',
    params: SetPhaseParams,
    execute: async (params) => {
      const { id, phase } = params as z.infer<typeof SetPhaseParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const updated = tagRegistry.update(id, { phase });
      if (!updated) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      eventBus.emit('tag:updated', { id, phase });
      controller.onTagChanged();
      return { success: true, data: { id, phase } };
    },
  });

  registry.register({
    name: 'tag.copy',
    description: 'Copy a tag to a new owner',
    category: 'tag',
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

  registry.register({
    name: 'tag.enable',
    description: 'Enable an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      tagRegistry.enable(id);
      eventBus.emit('tag:updated', { id, enabled: true });
      controller.onTagChanged();
      return { success: true, data: { id, enabled: true } };
    },
  });

  registry.register({
    name: 'tag.disable',
    description: 'Disable an expression tag',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }
      tagRegistry.disable(id);
      eventBus.emit('tag:updated', { id, enabled: false });
      controller.onTagChanged();
      return { success: true, data: { id, enabled: false } };
    },
  });

  // --- CRUD commands ---

  registry.register({
    name: 'tag.add',
    description: 'Create a new tag (expression, link, or script)',
    category: 'tag',
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
            return { success: false, error: 'property is required for code tags' };
          }
          const code = p.code ?? '';

          // If linkMeta is provided, this is a link-wizard-generated code tag.
          // Use addFromLink for proper fast-path setup (no Pyodide needed).
          if (p.linkMeta) {
            const srcAddr = p.sourceAddress ?? p.linkMeta.sourceAddress;
            const tgtAddr = p.targetAddress ?? `cell.${property}`;

            // Also add to legacy LinkRegistry during migration period
            const linkRegistry = controller.getLinkRegistry();
            if (linkRegistry) {
              try {
                const link = linkRegistry.add({
                  source: srcAddr,
                  target: tgtAddr,
                  sourceRange: p.linkMeta.sourceRange,
                  targetRange: p.linkMeta.targetRange,
                  easing: p.linkMeta.easing,
                });
                eventBus.emit('link:added', link);
              } catch {
                // Link already exists or cycle — tag registry will catch it too
              }
            }

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

          // Standard code expression tag (no linkMeta)
          // Lazily create scripting engines
          const engines = controller.ensureScriptingEngines();
          if (!engines) {
            return { success: false, error: 'Failed to initialize scripting engines' };
          }

          engines.expressionEngine.setExpression(property, code);
          eventBus.emit('script:expressionSet', { property, expression: code });

          // Remove existing tag for this property
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
            return { success: false, error: 'sourceAddress and targetAddress required for link tags' };
          }

          const sourceRange = p.sourceRange ?? [0, 1] as [number, number];
          const targetRange = p.targetRange ?? [0, 1] as [number, number];
          const easing = p.easing ?? 'linear';

          // Also add to legacy LinkRegistry
          const linkRegistry = controller.getLinkRegistry();
          if (linkRegistry) {
            const link = linkRegistry.add({
              source: sourceAddress,
              target: targetAddress,
              sourceRange,
              targetRange,
              easing,
            });
            eventBus.emit('link:added', link);
          }

          const tag = tagRegistry.addFromLink(sourceAddress, targetAddress, sourceRange, targetRange, easing as EasingType, true);
          if (p.phase) tagRegistry.update(tag.id, { phase: p.phase });
          if (p.owner) tagRegistry.update(tag.id, { owner: p.owner });
          eventBus.emit('tag:added', tag);
          controller.onLinkChanged();
          return { success: true, data: tag };

        } else if (p.source === 'script') {
          const name = p.name ?? 'untitled';
          const code = p.code ?? '';

          // Lazily create scripting engines
          const engines = controller.ensureScriptingEngines();
          if (!engines) {
            return { success: false, error: 'Failed to initialize scripting engines' };
          }

          engines.scriptRunner.addScript({
            name,
            enabled: true,
            code,
            inputs: p.inputs,
            outputs: p.outputs,
          });
          eventBus.emit('script:scriptAdded', { name, enabled: true, code });

          // Remove existing tag for this script
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
    name: 'tag.remove',
    description: 'Remove a tag and its underlying legacy data',
    category: 'tag',
    params: IdParams,
    execute: async (params) => {
      const { id } = params as z.infer<typeof IdParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(id);
      if (!tag) {
        return { success: false, error: `Tag "${id}" not found` };
      }

      // Clean up the legacy system based on source
      if (tag.linkMeta) {
        // Link-created tags (source: 'code' with linkMeta) — clean up legacy link registry
        const linkRegistry = controller.getLinkRegistry();
        if (linkRegistry) {
          const links = linkRegistry.getAll();
          const match = links.find(
            (l) => l.source === tag.linkMeta!.sourceAddress && tag.outputs.includes(l.target),
          );
          if (match) {
            linkRegistry.remove(match.id);
            eventBus.emit('link:removed', { id: match.id });
          }
        }
      } else if (tag.source === 'code') {
        const engine = controller.getExpressionEngine();
        if (engine) {
          for (const output of tag.outputs) {
            const parts = output.split('.');
            if (parts.length === 2 && parts[0] === 'cell') {
              engine.clearExpression(parts[1]);
              eventBus.emit('script:expressionCleared', { property: parts[1] });
            }
          }
        }
      } else if (tag.source === 'script') {
        const runner = controller.getGlobalScriptRunner();
        if (runner) {
          runner.removeScript(tag.name);
          eventBus.emit('script:scriptRemoved', { name: tag.name });
        }
      }

      tagRegistry.remove(id);
      eventBus.emit('tag:removed', { id });
      controller.onTagChanged();
      return { success: true, data: { id } };
    },
  });

  registry.register({
    name: 'tag.edit',
    description: 'Edit a tag\'s code, phase, ranges, or other properties',
    category: 'tag',
    params: EditParams,
    execute: async (params) => {
      const p = params as z.infer<typeof EditParams>;
      const tagRegistry = controller.getTagRegistry();
      if (!tagRegistry) {
        return { success: false, error: 'No simulation loaded' };
      }
      const tag = tagRegistry.get(p.id);
      if (!tag) {
        return { success: false, error: `Tag "${p.id}" not found` };
      }

      // Build patch for the tag
      const patch: Record<string, unknown> = {};
      if (p.code !== undefined) patch.code = p.code;
      if (p.name !== undefined) patch.name = p.name;
      if (p.phase !== undefined) patch.phase = p.phase;
      if (p.inputs !== undefined) patch.inputs = p.inputs;
      if (p.outputs !== undefined) patch.outputs = p.outputs;

      // Mirror to legacy system based on source
      if (tag.linkMeta) {
        // Link-created tags (source: 'code' with linkMeta) — mirror to legacy link registry
        const linkRegistry = controller.getLinkRegistry();
        if (linkRegistry) {
          const links = linkRegistry.getAll();
          const match = links.find(
            (l) => l.source === tag.linkMeta!.sourceAddress && tag.outputs.includes(l.target),
          );
          if (match) {
            const linkPatch: Record<string, unknown> = {};
            if (p.sourceRange) linkPatch.sourceRange = p.sourceRange;
            if (p.targetRange) linkPatch.targetRange = p.targetRange;
            if (p.easing) linkPatch.easing = p.easing;
            if (Object.keys(linkPatch).length > 0) {
              linkRegistry.update(match.id, linkPatch as { sourceRange?: [number, number]; targetRange?: [number, number]; easing?: EasingType });
            }
            eventBus.emit('link:updated', { id: match.id });
          }
        }
        // Update linkMeta on tag
        if (p.sourceRange || p.targetRange || p.easing) {
          patch.linkMeta = {
            ...tag.linkMeta!,
            ...(p.sourceRange ? { sourceRange: p.sourceRange } : {}),
            ...(p.targetRange ? { targetRange: p.targetRange } : {}),
            ...(p.easing ? { easing: p.easing as EasingType } : {}),
          };
        }
      } else if (tag.source === 'code') {
        if (p.code !== undefined) {
          const engine = controller.getExpressionEngine();
          if (engine) {
            for (const output of tag.outputs) {
              const parts = output.split('.');
              if (parts.length === 2 && parts[0] === 'cell') {
                engine.setExpression(parts[1], p.code);
              }
            }
          }
          eventBus.emit('script:expressionSet', { property: tag.outputs[0], expression: p.code });
        }
      } else if (tag.source === 'script') {
        if (p.code !== undefined || p.inputs !== undefined || p.outputs !== undefined) {
          const engines = controller.ensureScriptingEngines();
          if (engines) {
            engines.scriptRunner.removeScript(tag.name);
            engines.scriptRunner.addScript({
              name: p.name ?? tag.name,
              enabled: tag.enabled,
              code: p.code ?? tag.code,
              inputs: p.inputs ?? tag.inputs,
              outputs: p.outputs ?? tag.outputs,
            });
          }
          eventBus.emit('script:scriptAdded', { name: p.name ?? tag.name, enabled: tag.enabled, code: p.code ?? tag.code });
        }
      }

      const updated = tagRegistry.update(p.id, patch as Parameters<typeof tagRegistry.update>[1]);
      if (!updated) {
        return { success: false, error: `Failed to update tag "${p.id}"` };
      }
      eventBus.emit('tag:updated', { id: p.id });
      controller.onTagChanged();
      return { success: true, data: updated };
    },
  });
}
