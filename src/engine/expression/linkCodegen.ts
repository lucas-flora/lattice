/**
 * Code generation for link wizard.
 *
 * The link wizard is a creation-time UI that produces a normal 'code' tag
 * with generated rangeMap() Python expression. The linkMeta is preserved
 * on the tag for JS fast-path resolution (no Pyodide needed).
 */

import type { LinkMeta } from './types';
import { parseAddress } from './PropertyAddress';

/**
 * Generate Python code for a link-style rangeMap tag.
 * This is the code that would execute if the tag went through Pyodide,
 * but tags with linkMeta are resolved via the JS fast-path instead.
 */
export function generateLinkCode(meta: LinkMeta, targetAddress: string): string {
  const { sourceAddress, sourceRange, targetRange, easing } = meta;
  return (
    `# Auto-generated from link: ${sourceAddress} → ${targetAddress}\n` +
    `# rangeMap(${sourceAddress}, [${sourceRange}], [${targetRange}], ${easing})\n` +
    `self.${parseAddress(targetAddress).key} = rangeMap(${sourceAddress}, ${JSON.stringify(sourceRange)}, ${JSON.stringify(targetRange)}, "${easing}")`
  );
}
