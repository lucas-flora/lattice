/**
 * Backward-compatible tag.* command aliases.
 *
 * All tag.* commands forward to op.* equivalents. Kept for backward compatibility.
 * Primary commands are now registered in op.ts under the 'op' category.
 */

import { z } from 'zod';
import type { CommandRegistry } from '../CommandRegistry';

const NoParams = z.object({}).describe('none');
const AnyParams = z.record(z.unknown()).describe('(forwarded)');

/** Command aliases: tag.X → op.X */
const TAG_TO_OP: Array<{ tag: string; op: string; params: z.ZodType }> = [
  { tag: 'tag.list', op: 'op.list', params: NoParams },
  { tag: 'tag.show', op: 'op.show', params: AnyParams },
  { tag: 'tag.setPhase', op: 'op.setPhase', params: AnyParams },
  { tag: 'tag.copy', op: 'op.copy', params: AnyParams },
  { tag: 'tag.enable', op: 'op.enable', params: AnyParams },
  { tag: 'tag.disable', op: 'op.disable', params: AnyParams },
  { tag: 'tag.add', op: 'op.add', params: AnyParams },
  { tag: 'tag.remove', op: 'op.remove', params: AnyParams },
  { tag: 'tag.edit', op: 'op.edit', params: AnyParams },
];

export function registerTagCommands(
  registry: CommandRegistry,
): void {
  for (const { tag, op, params } of TAG_TO_OP) {
    registry.register({
      name: tag,
      description: `(alias for ${op})`,
      category: 'tag',
      params,
      execute: async (p) => registry.execute(op, p),
    });
  }
}
