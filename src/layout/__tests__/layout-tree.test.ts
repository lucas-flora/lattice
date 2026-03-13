/**
 * Layout tree operation tests.
 *
 * Tests the pure functional layout tree manipulation:
 * split, addTab, removePanel, resize, findNode.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  findNode,
  findParent,
  splitNode,
  addTab,
  removePanel,
  resizeSplit,
  setActiveTab,
  collectPanelIds,
  collectPanelTypes,
  resetLayoutIds,
} from '../LayoutTree';
import type { LayoutNode } from '../types';

describe('LayoutTree', () => {
  beforeEach(() => {
    resetLayoutIds();
  });

  const singlePanel: LayoutNode = {
    type: 'panel',
    id: 'p1',
    panelType: 'viewport',
  };

  const splitLayout: LayoutNode = {
    type: 'split',
    id: 's1',
    direction: 'h',
    children: [
      { type: 'panel', id: 'p1', panelType: 'viewport' },
      { type: 'panel', id: 'p2', panelType: 'terminal' },
    ],
    sizes: [60, 40],
  };

  it('TestLayoutTree_FindNode_FindsById', () => {
    expect(findNode(splitLayout, 'p1')?.id).toBe('p1');
    expect(findNode(splitLayout, 'p2')?.id).toBe('p2');
    expect(findNode(splitLayout, 's1')?.id).toBe('s1');
    expect(findNode(splitLayout, 'nonexistent')).toBeNull();
  });

  it('TestLayoutTree_FindParent_FindsParentOfChild', () => {
    const parent = findParent(splitLayout, 'p1');
    expect(parent?.id).toBe('s1');
    expect(findParent(splitLayout, 's1')).toBeNull();
  });

  it('TestLayoutTree_SplitNode_CreatesSplitFromPanel', () => {
    const newPanel: LayoutNode = { type: 'panel', id: 'p2', panelType: 'terminal' };
    const result = splitNode(singlePanel, 'p1', newPanel, 'v');

    expect(result.type).toBe('split');
    if (result.type === 'split') {
      expect(result.direction).toBe('v');
      expect(result.children).toHaveLength(2);
      expect(result.children[0].id).toBe('p1');
      expect(result.children[1].id).toBe('p2');
      expect(result.sizes).toEqual([50, 50]);
    }
  });

  it('TestLayoutTree_SplitNode_InsertsBefore', () => {
    const newPanel: LayoutNode = { type: 'panel', id: 'p2', panelType: 'terminal' };
    const result = splitNode(singlePanel, 'p1', newPanel, 'h', false);

    if (result.type === 'split') {
      expect(result.children[0].id).toBe('p2');
      expect(result.children[1].id).toBe('p1');
    }
  });

  it('TestLayoutTree_AddTab_ConvertsPanelToTabs', () => {
    const newPanel: LayoutNode = { type: 'panel', id: 'p2', panelType: 'terminal' };
    const result = addTab(singlePanel, 'p1', newPanel);

    expect(result.type).toBe('tabs');
    if (result.type === 'tabs') {
      expect(result.children).toHaveLength(2);
      expect(result.activeIndex).toBe(1);
    }
  });

  it('TestLayoutTree_AddTab_AppendsToExistingTabs', () => {
    const tabsNode: LayoutNode = {
      type: 'tabs',
      id: 't1',
      children: [
        { type: 'panel', id: 'p1', panelType: 'viewport' },
        { type: 'panel', id: 'p2', panelType: 'terminal' },
      ],
      activeIndex: 0,
    };
    const newPanel: LayoutNode = { type: 'panel', id: 'p3', panelType: 'paramPanel' };
    const result = addTab(tabsNode, 't1', newPanel);

    if (result.type === 'tabs') {
      expect(result.children).toHaveLength(3);
      expect(result.activeIndex).toBe(2);
    }
  });

  it('TestLayoutTree_RemovePanel_FromSplit_CollapsesToSingle', () => {
    const result = removePanel(splitLayout, 'p2');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('panel');
    expect(result!.id).toBe('p1');
  });

  it('TestLayoutTree_RemovePanel_ReturnsNull_WhenLastRemoved', () => {
    const result = removePanel(singlePanel, 'p1');
    expect(result).toBeNull();
  });

  it('TestLayoutTree_ResizeSplit_UpdatesSizes', () => {
    const result = resizeSplit(splitLayout, 's1', [70, 30]);
    if (result.type === 'split') {
      expect(result.sizes).toEqual([70, 30]);
    }
  });

  it('TestLayoutTree_SetActiveTab_ClampsIndex', () => {
    const tabsNode: LayoutNode = {
      type: 'tabs',
      id: 't1',
      children: [
        { type: 'panel', id: 'p1', panelType: 'viewport' },
        { type: 'panel', id: 'p2', panelType: 'terminal' },
      ],
      activeIndex: 0,
    };

    const result = setActiveTab(tabsNode, 't1', 1);
    if (result.type === 'tabs') {
      expect(result.activeIndex).toBe(1);
    }

    const clamped = setActiveTab(tabsNode, 't1', 99);
    if (clamped.type === 'tabs') {
      expect(clamped.activeIndex).toBe(1);
    }
  });

  it('TestLayoutTree_CollectPanelIds', () => {
    const ids = collectPanelIds(splitLayout);
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('TestLayoutTree_CollectPanelTypes', () => {
    const types = collectPanelTypes(splitLayout);
    expect(types).toEqual(['viewport', 'terminal']);
  });
});
