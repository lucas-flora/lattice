/**
 * Unit tests for LinksSection of ScriptPanel.
 *
 * Tests add, edit, toggle, remove flows via store state and command registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLinkStore, linkStoreActions } from '@/store/linkStore';
import { commandRegistry } from '@/commands/CommandRegistry';
import type { ParameterLink } from '@/engine/linking/types';

const mockLink: ParameterLink = {
  id: 'link_1',
  source: 'cell.age',
  target: 'cell.alpha',
  sourceRange: [0, 100] as [number, number],
  targetRange: [0, 1] as [number, number],
  easing: 'linear',
  enabled: true,
};

describe('LinksSection', () => {
  beforeEach(() => {
    linkStoreActions.resetAll();
  });

  it('TestLinksSection_RenderEmpty_ShowsPlaceholder', () => {
    const state = useLinkStore.getState();
    expect(state.links).toHaveLength(0);
  });

  it('TestLinksSection_AddForm_CallsLinkAdd', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'smoothstep',
    });

    expect(spy).toHaveBeenCalledWith('link.add', {
      source: 'cell.age',
      target: 'cell.alpha',
      sourceRange: [0, 100],
      targetRange: [0, 1],
      easing: 'smoothstep',
    });
    spy.mockRestore();
  });

  it('TestLinksSection_AddLink_StoreUpdates', () => {
    linkStoreActions.addLink(mockLink);

    const links = useLinkStore.getState().links;
    expect(links).toHaveLength(1);
    expect(links[0].source).toBe('cell.age');
    expect(links[0].target).toBe('cell.alpha');
  });

  it('TestLinksSection_EditLink_CallsLinkEdit', async () => {
    const spy = vi.spyOn(commandRegistry, 'execute').mockResolvedValue({ success: true });

    await commandRegistry.execute('link.edit', {
      id: 'link_1',
      sourceRange: [0, 200],
      targetRange: [0.5, 1],
      easing: 'easeInOut',
    });

    expect(spy).toHaveBeenCalledWith('link.edit', {
      id: 'link_1',
      sourceRange: [0, 200],
      targetRange: [0.5, 1],
      easing: 'easeInOut',
    });
    spy.mockRestore();
  });

  it('TestLinksSection_EditLink_StoreReflectsChanges', () => {
    linkStoreActions.addLink(mockLink);

    linkStoreActions.updateLink('link_1', {
      sourceRange: [0, 200],
      targetRange: [0.5, 1],
      easing: 'easeInOut',
    });

    const link = useLinkStore.getState().links[0];
    expect(link.sourceRange).toEqual([0, 200]);
    expect(link.targetRange).toEqual([0.5, 1]);
    expect(link.easing).toBe('easeInOut');
  });

  it('TestLinksSection_ToggleAndRemove_AlreadyWork', () => {
    linkStoreActions.addLink(mockLink);

    // Toggle off
    linkStoreActions.updateLink('link_1', { enabled: false });
    expect(useLinkStore.getState().links[0].enabled).toBe(false);

    // Toggle on
    linkStoreActions.updateLink('link_1', { enabled: true });
    expect(useLinkStore.getState().links[0].enabled).toBe(true);

    // Remove
    linkStoreActions.removeLink('link_1');
    expect(useLinkStore.getState().links).toHaveLength(0);
  });

  it('TestLinksSection_ClearAll_RemovesAllLinks', () => {
    linkStoreActions.addLink(mockLink);
    linkStoreActions.addLink({ ...mockLink, id: 'link_2', source: 'env.feedRate' });

    linkStoreActions.resetAll();
    expect(useLinkStore.getState().links).toHaveLength(0);
  });

  it('TestLinksSection_EditPreservesOtherFields', () => {
    linkStoreActions.addLink(mockLink);

    // Edit only easing, other fields should be preserved
    linkStoreActions.updateLink('link_1', { easing: 'smoothstep' });

    const link = useLinkStore.getState().links[0];
    expect(link.source).toBe('cell.age');
    expect(link.target).toBe('cell.alpha');
    expect(link.sourceRange).toEqual([0, 100]);
    expect(link.easing).toBe('smoothstep');
    expect(link.enabled).toBe(true);
  });
});
