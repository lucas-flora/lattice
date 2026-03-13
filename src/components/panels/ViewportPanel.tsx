/**
 * ViewportPanel: panel wrapper for SimulationViewport.
 *
 * Adapts SimulationViewport to the PanelProps interface for the layout system.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { SimulationViewport } from '@/components/viewport/SimulationViewport';

export function ViewportPanel({ panelId }: PanelProps) {
  return <SimulationViewport viewportId={panelId} />;
}
