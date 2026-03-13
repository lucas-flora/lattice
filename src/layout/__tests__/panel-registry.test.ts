/**
 * PanelRegistry tests.
 *
 * Tests panel type registration, lookup, and listing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { panelRegistry } from '../PanelRegistry';

// Minimal mock component
const MockComponent = () => null;

describe('PanelRegistry', () => {
  beforeEach(() => {
    panelRegistry.clear();
  });

  it('TestPanelRegistry_RegisterAndGet', () => {
    panelRegistry.register({
      type: 'viewport',
      label: 'Viewport',
      component: MockComponent,
    });

    const descriptor = panelRegistry.get('viewport');
    expect(descriptor).toBeDefined();
    expect(descriptor!.type).toBe('viewport');
    expect(descriptor!.label).toBe('Viewport');
  });

  it('TestPanelRegistry_Has', () => {
    expect(panelRegistry.has('viewport')).toBe(false);

    panelRegistry.register({
      type: 'viewport',
      label: 'Viewport',
      component: MockComponent,
    });

    expect(panelRegistry.has('viewport')).toBe(true);
  });

  it('TestPanelRegistry_GetAll', () => {
    panelRegistry.register({ type: 'viewport', label: 'Viewport', component: MockComponent });
    panelRegistry.register({ type: 'terminal', label: 'Terminal', component: MockComponent });

    const all = panelRegistry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((d) => d.type)).toContain('viewport');
    expect(all.map((d) => d.type)).toContain('terminal');
  });

  it('TestPanelRegistry_UnknownTypeReturnsUndefined', () => {
    expect(panelRegistry.get('nonexistent')).toBeUndefined();
  });

  it('TestPanelRegistry_Clear', () => {
    panelRegistry.register({ type: 'viewport', label: 'Viewport', component: MockComponent });
    expect(panelRegistry.has('viewport')).toBe(true);

    panelRegistry.clear();
    expect(panelRegistry.has('viewport')).toBe(false);
  });
});
