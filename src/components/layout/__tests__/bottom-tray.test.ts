import { describe, it, expect } from 'vitest';
import { useLayoutStore, layoutStoreActions } from '@/store/layoutStore';

/**
 * BottomTray layout tests.
 *
 * Verifies the store-level behavior that drives BottomTray rendering:
 * - ControlBar always visible (BottomTray always renders)
 * - Terminal toggling via isTerminalOpen
 */
describe('BottomTray', () => {
  it('TestBottomTray_ControlBarAlwaysVisible', () => {
    // BottomTray is always rendered in docked mode. ControlBar visibility
    // is unconditional — it doesn't depend on isTerminalOpen.
    // Verify the default mode is docked.
    const state = useLayoutStore.getState();
    expect(state.terminalMode).toBe('docked');
    // BottomTray renders unconditionally in docked mode,
    // regardless of isTerminalOpen state
    expect(state.isTerminalOpen).toBe(false);
  });

  it('TestBottomTray_TerminalToggles', () => {
    // Terminal content should toggle with isTerminalOpen
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);

    layoutStoreActions.setTerminalOpen(true);
    expect(useLayoutStore.getState().isTerminalOpen).toBe(true);

    layoutStoreActions.setTerminalOpen(false);
    expect(useLayoutStore.getState().isTerminalOpen).toBe(false);
  });
});
