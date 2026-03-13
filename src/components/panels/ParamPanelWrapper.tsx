/**
 * ParamPanelWrapper: panel wrapper for ParamPanel.
 *
 * Adapts ParamPanel to the PanelProps interface for the layout system.
 * Always renders in docked mode when used as a panel.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { ParamPanel } from '@/components/panels/ParamPanel';

export function ParamPanelWrapper(_props: PanelProps) {
  return <ParamPanel docked />;
}
