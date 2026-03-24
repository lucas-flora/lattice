/**
 * Brush state store.
 *
 * Manages available brushes (loaded from preset YAML), active brush selection,
 * and runtime radius override. The brush system is property-aware — each brush
 * defines which cell properties it writes and how (set/add/multiply).
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Brush, BrushPropertyAction } from '../engine/preset/schema';

export type { Brush, BrushPropertyAction };

/**
 * Blend mode override — changes how the active brush applies its values.
 * 'normal' uses the brush's own per-property modes as defined in YAML.
 * Other modes override all properties to that mode.
 * 'clear' is a special mode that sets all brush properties to 0.
 */
export type BrushBlendMode = 'normal' | 'set' | 'add' | 'multiply' | 'random' | 'clear';

export interface BrushState {
  /** All brushes available for the current preset */
  availableBrushes: Brush[];
  /** Index of the currently selected brush */
  activeBrushIndex: number;
  /** User-overridden radius (null = use brush's default) */
  radiusOverride: number | null;
  /** Blend mode override — 'normal' uses brush defaults */
  blendMode: BrushBlendMode;
  /** Per-brush blend mode memory (indexed by brush name) */
  perBrushBlendMode: Record<string, BrushBlendMode>;
}

export const useBrushStore = create<BrushState>()(
  subscribeWithSelector((): BrushState => ({
    availableBrushes: [],
    activeBrushIndex: 0,
    radiusOverride: null,
    blendMode: 'normal',
    perBrushBlendMode: {},
  })),
);

/** Internal/velocity properties excluded from default brush generation */
const INTERNAL_PROPS = new Set(['vx', 'vy', 'pressure', 'curl', '_cellType',
  'colorR', 'colorG', 'colorB', 'alpha', 'age']);

/**
 * Build a default brush from a preset's cell properties.
 * Uses the draw_property or first non-internal property — never hardcodes a specific name.
 */
function buildDefaultBrush(
  cellProperties?: Array<{ name: string }>,
  drawProperty?: string,
): Brush {
  // Prefer explicit draw_property, then first non-internal user property
  let propName = drawProperty;
  if (!propName && cellProperties && cellProperties.length > 0) {
    const userProp = cellProperties.find(p => !INTERNAL_PROPS.has(p.name));
    propName = userProp?.name ?? cellProperties[0].name;
  }
  propName = propName ?? 'value';

  return {
    name: 'Default',
    properties: { [propName]: { value: 1, mode: 'set' as const } },
    radius: 3,
    shape: 'circle',
    falloff: 'hard',
  };
}

export const brushStoreActions = {
  /**
   * Load brushes from a parsed preset config.
   * If no brushes defined, builds a default from the preset's cell properties.
   */
  loadFromPreset(
    brushes: Brush[] | undefined,
    cellProperties?: Array<{ name: string }>,
    drawProperty?: string,
  ): void {
    const available = brushes && brushes.length > 0
      ? brushes
      : [buildDefaultBrush(cellProperties, drawProperty)];
    useBrushStore.setState({
      availableBrushes: available,
      activeBrushIndex: 0,
      radiusOverride: null,
      blendMode: 'normal',
      perBrushBlendMode: {},
    });
  },

  /** Select a brush by index — saves current blend mode, restores target's */
  selectByIndex(index: number): void {
    const s = useBrushStore.getState();
    if (index < 0 || index >= s.availableBrushes.length || index === s.activeBrushIndex) return;
    // Save current brush's blend mode
    const currentBrush = s.availableBrushes[s.activeBrushIndex];
    const saved = { ...s.perBrushBlendMode };
    if (currentBrush) saved[currentBrush.name] = s.blendMode;
    // Restore target brush's blend mode (or 'normal')
    const targetBrush = s.availableBrushes[index];
    const restoredMode = (targetBrush && saved[targetBrush.name]) || 'normal';
    useBrushStore.setState({
      activeBrushIndex: index,
      blendMode: restoredMode,
      perBrushBlendMode: saved,
    });
  },

  /** Select a brush by name (case-insensitive) */
  selectByName(name: string): boolean {
    const { availableBrushes } = useBrushStore.getState();
    const lower = name.toLowerCase();
    const idx = availableBrushes.findIndex(b => b.name.toLowerCase() === lower);
    if (idx >= 0) {
      brushStoreActions.selectByIndex(idx);
      return true;
    }
    return false;
  },

  /** Set runtime radius override */
  setRadiusOverride(radius: number | null): void {
    useBrushStore.setState({ radiusOverride: radius });
  },

  /** Get the effective radius (override or brush default) */
  getEffectiveRadius(): number {
    const { availableBrushes, activeBrushIndex, radiusOverride } = useBrushStore.getState();
    if (radiusOverride !== null) return radiusOverride;
    const brush = availableBrushes[activeBrushIndex];
    return brush?.radius ?? 3;
  },

  /** Get the active brush (raw, without blend mode applied) */
  getActiveBrush(): Brush | null {
    const { availableBrushes, activeBrushIndex } = useBrushStore.getState();
    return availableBrushes[activeBrushIndex] ?? null;
  },

  /**
   * Get the active brush with blend mode override applied.
   * - 'normal': use brush as-is
   * - 'set'/'add'/'multiply'/'random': override all property modes
   * - 'clear': override all properties to set 0
   */
  getEffectiveBrush(): Brush | null {
    const { availableBrushes, activeBrushIndex, blendMode } = useBrushStore.getState();
    const brush = availableBrushes[activeBrushIndex];
    if (!brush) return null;
    if (blendMode === 'normal') return brush;

    const overriddenProps: Record<string, BrushPropertyAction> = {};
    for (const [name, action] of Object.entries(brush.properties)) {
      if (blendMode === 'clear') {
        overriddenProps[name] = { value: 0, mode: 'set' };
      } else {
        overriddenProps[name] = { value: action.value, mode: blendMode };
      }
    }
    return { ...brush, properties: overriddenProps };
  },

  /** Set the blend mode override */
  setBlendMode(mode: BrushBlendMode): void {
    useBrushStore.setState({ blendMode: mode });
  },

  /** Cycle to the next blend mode */
  cycleBlendMode(): void {
    const modes: BrushBlendMode[] = ['normal', 'add', 'multiply', 'random', 'clear'];
    const { blendMode } = useBrushStore.getState();
    const idx = modes.indexOf(blendMode);
    const next = modes[(idx + 1) % modes.length];
    useBrushStore.setState({ blendMode: next });
  },

  /** Add a new brush at runtime */
  addBrush(brush: Brush): void {
    useBrushStore.setState(s => ({
      availableBrushes: [...s.availableBrushes, brush],
    }));
  },

  /** Remove a brush by name */
  removeBrush(name: string): boolean {
    const s = useBrushStore.getState();
    const idx = s.availableBrushes.findIndex(b => b.name === name);
    if (idx < 0) return false;
    const next = s.availableBrushes.filter((_, i) => i !== idx);
    const newActiveIdx = s.activeBrushIndex >= next.length
      ? Math.max(0, next.length - 1)
      : s.activeBrushIndex;
    useBrushStore.setState({
      availableBrushes: next,
      activeBrushIndex: newActiveIdx,
    });
    return true;
  },

  /** Update an existing brush by name */
  editBrush(name: string, updates: Partial<Omit<Brush, 'name'>>): boolean {
    const s = useBrushStore.getState();
    const idx = s.availableBrushes.findIndex(b => b.name === name);
    if (idx < 0) return false;
    const updated = [...s.availableBrushes];
    updated[idx] = { ...updated[idx], ...updates };
    useBrushStore.setState({ availableBrushes: updated });
    return true;
  },

  /** Adjust radius by delta (clamp 1..100) */
  adjustRadius(delta: number): void {
    const current = brushStoreActions.getEffectiveRadius();
    const next = Math.max(1, Math.min(100, current + delta));
    useBrushStore.setState({ radiusOverride: next });
  },
};
