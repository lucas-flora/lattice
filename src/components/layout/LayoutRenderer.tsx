/**
 * LayoutRenderer: recursively renders a LayoutNode tree.
 *
 * Maps LayoutNode types to SplitContainer, TabContainer, and PanelHost components.
 */

'use client';

import type { LayoutNode } from '@/layout/types';
import { panelRegistry } from '@/layout/PanelRegistry';
import { PanelHost } from './PanelHost';
import { SplitContainer } from './SplitContainer';
import { TabContainer } from './TabContainer';

interface LayoutRendererProps {
  node: LayoutNode;
  onLayoutChange?: (node: LayoutNode) => void;
}

export function LayoutRenderer({ node, onLayoutChange }: LayoutRendererProps) {
  if (node.type === 'panel') {
    return (
      <PanelHost
        panelType={node.panelType}
        panelId={node.id}
        config={node.config}
      />
    );
  }

  if (node.type === 'split') {
    return (
      <SplitContainer
        direction={node.direction}
        sizes={node.sizes}
        onResize={(sizes) => {
          onLayoutChange?.({ ...node, sizes });
        }}
      >
        {node.children.map((child) => (
          <LayoutRenderer
            key={child.id}
            node={child}
            onLayoutChange={(updatedChild) => {
              const newChildren = node.children.map((c) =>
                c.id === updatedChild.id ? updatedChild : c,
              );
              onLayoutChange?.({ ...node, children: newChildren });
            }}
          />
        ))}
      </SplitContainer>
    );
  }

  if (node.type === 'tabs') {
    const labels = node.children.map((child) => {
      if (child.type === 'panel') {
        const descriptor = panelRegistry.get(child.panelType);
        return descriptor?.label ?? child.panelType;
      }
      return 'Group';
    });

    return (
      <TabContainer
        labels={labels}
        activeIndex={node.activeIndex}
        onTabChange={(index) => {
          onLayoutChange?.({ ...node, activeIndex: index });
        }}
      >
        {node.children.map((child) => (
          <LayoutRenderer
            key={child.id}
            node={child}
            onLayoutChange={(updatedChild) => {
              const newChildren = node.children.map((c) =>
                c.id === updatedChild.id ? updatedChild : c,
              );
              onLayoutChange?.({ ...node, children: newChildren });
            }}
          />
        ))}
      </TabContainer>
    );
  }

  return null;
}
