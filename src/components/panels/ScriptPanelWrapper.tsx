/**
 * ScriptPanelWrapper: panel wrapper for ScriptPanel.
 *
 * Adapts ScriptPanel to the PanelProps interface for the layout system.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { ScriptPanel } from '@/components/panels/ScriptPanel';

export function ScriptPanelWrapper(_props: PanelProps) {
  return <ScriptPanel docked />;
}
