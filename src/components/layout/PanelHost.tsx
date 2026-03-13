/**
 * PanelHost: resolves a panelType string to a registered React component and renders it.
 */

'use client';

import { panelRegistry } from '@/layout/PanelRegistry';
import type { PanelProps } from '@/layout/types';

interface PanelHostProps {
  panelType: string;
  panelId: string;
  config?: Record<string, unknown>;
}

export function PanelHost({ panelType, panelId, config }: PanelHostProps) {
  const descriptor = panelRegistry.get(panelType);

  if (!descriptor) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm">
        Unknown panel: {panelType}
      </div>
    );
  }

  const Component = descriptor.component;
  const panelProps: PanelProps = { panelId, config };

  return <Component {...panelProps} />;
}
