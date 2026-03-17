/**
 * Shared theme constants for the node editor.
 */

import type { PortType, NodeCategory } from '@/engine/nodes/types';

/** Port type → color (Tailwind class) */
export const PORT_COLORS: Record<PortType, string> = {
  scalar: '#4ade80',   // green-400
  array: '#60a5fa',    // blue-400
  bool: '#fbbf24',     // amber-400
  string: '#a1a1aa',   // zinc-400
};

/** Category → header accent color */
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  property: '#4ade80', // green-400
  math: '#60a5fa',     // blue-400
  range: '#c084fc',    // purple-400
  logic: '#fbbf24',    // amber-400
  utility: '#f472b6',  // pink-400
};

/** Category → label */
export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  property: 'Property',
  math: 'Math',
  range: 'Range',
  logic: 'Logic',
  utility: 'Utility',
};
