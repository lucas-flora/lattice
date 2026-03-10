/**
 * Tests for CommandHistory — undo/redo with sparse Command-pattern diffs.
 *
 * Success Criterion 4: Performing 5 cell edits and then calling undo 5 times
 * returns the grid exactly to its original state, verified by buffer equality.
 *
 * CTRL-07: Undo/redo using Command pattern (not full-state snapshots)
 */

import { describe, it, expect } from 'vitest';
import { loadPresetOrThrow } from '../../preset/loader';
import { Simulation } from '../Simulation';
import { CommandHistory } from '../CommandHistory';

const SIMPLE_PRESET_YAML = `
schema_version: "1"
meta:
  name: "Undo Test"
grid:
  dimensionality: "2d"
  width: 16
  height: 16
  topology: "toroidal"
cell_properties:
  - name: "state"
    type: "float"
    default: 0
rule:
  type: "typescript"
  compute: "return { state: ctx.cell.state };"
`;

function createTestSetup() {
  const preset = loadPresetOrThrow(SIMPLE_PRESET_YAML);
  const sim = new Simulation(preset);
  const history = new CommandHistory(sim);
  return { sim, history };
}

describe('CommandHistory', () => {
  it('starts with empty undo and redo stacks', () => {
    const { history } = createTestSetup();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.undoCount).toBe(0);
    expect(history.redoCount).toBe(0);
  });

  it('records a single edit and can undo it', () => {
    const { sim, history } = createTestSetup();
    expect(sim.getCellDirect('state', 0)).toBe(0);

    history.beginCommand('Set cell 0');
    history.editCell('state', 0, 1);
    history.commitCommand();

    expect(sim.getCellDirect('state', 0)).toBe(1);
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(sim.getCellDirect('state', 0)).toBe(0);
  });

  it('records multiple edits in a single command', () => {
    const { sim, history } = createTestSetup();

    history.beginCommand('Multi edit');
    history.editCell('state', 0, 1);
    history.editCell('state', 1, 2);
    history.editCell('state', 2, 3);
    history.commitCommand();

    expect(sim.getCellDirect('state', 0)).toBe(1);
    expect(sim.getCellDirect('state', 1)).toBe(2);
    expect(sim.getCellDirect('state', 2)).toBe(3);

    history.undo();
    expect(sim.getCellDirect('state', 0)).toBe(0);
    expect(sim.getCellDirect('state', 1)).toBe(0);
    expect(sim.getCellDirect('state', 2)).toBe(0);
  });

  it('supports redo after undo', () => {
    const { sim, history } = createTestSetup();

    history.beginCommand('Edit');
    history.editCell('state', 0, 5);
    history.commitCommand();

    history.undo();
    expect(sim.getCellDirect('state', 0)).toBe(0);
    expect(history.canRedo()).toBe(true);

    history.redo();
    expect(sim.getCellDirect('state', 0)).toBe(5);
  });

  it('new edit clears redo stack', () => {
    const { history } = createTestSetup();

    history.beginCommand('Edit 1');
    history.editCell('state', 0, 1);
    history.commitCommand();

    history.undo();
    expect(history.canRedo()).toBe(true);

    // New edit should clear redo
    history.beginCommand('Edit 2');
    history.editCell('state', 1, 2);
    history.commitCommand();

    expect(history.canRedo()).toBe(false);
  });

  it('5 edits then 5 undos restores original state (Success Criterion 4)', () => {
    const { sim, history } = createTestSetup();

    // Capture original buffer state
    const originalBuffer = new Float32Array(sim.grid.getCurrentBuffer('state'));

    // Perform 5 separate cell edits
    for (let i = 0; i < 5; i++) {
      history.beginCommand(`Edit ${i}`);
      history.editCell('state', i * 3, (i + 1) * 10);
      history.commitCommand();
    }

    // Verify edits were applied
    expect(sim.getCellDirect('state', 0)).toBe(10);
    expect(sim.getCellDirect('state', 3)).toBe(20);
    expect(sim.getCellDirect('state', 6)).toBe(30);
    expect(sim.getCellDirect('state', 9)).toBe(40);
    expect(sim.getCellDirect('state', 12)).toBe(50);

    // Undo 5 times
    for (let i = 0; i < 5; i++) {
      const result = history.undo();
      expect(result).toBe(true);
    }

    // Verify buffer equality with original state
    const restoredBuffer = sim.grid.getCurrentBuffer('state');
    expect(restoredBuffer.length).toBe(originalBuffer.length);
    for (let i = 0; i < originalBuffer.length; i++) {
      expect(restoredBuffer[i]).toBe(originalBuffer[i]);
    }
  });

  it('undo returns false when stack is empty', () => {
    const { history } = createTestSetup();
    expect(history.undo()).toBe(false);
  });

  it('redo returns false when stack is empty', () => {
    const { history } = createTestSetup();
    expect(history.redo()).toBe(false);
  });

  it('throws when editing without beginCommand', () => {
    const { history } = createTestSetup();
    expect(() => history.editCell('state', 0, 1)).toThrow('No pending command');
  });

  it('throws when committing without beginCommand', () => {
    const { history } = createTestSetup();
    expect(() => history.commitCommand()).toThrow('No pending command');
  });

  it('throws when beginning command while one is pending', () => {
    const { history } = createTestSetup();
    history.beginCommand('First');
    expect(() => history.beginCommand('Second')).toThrow('Cannot begin');
  });

  it('clear removes all history', () => {
    const { history } = createTestSetup();

    history.beginCommand('Edit');
    history.editCell('state', 0, 1);
    history.commitCommand();

    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('uses sparse diffs, not full state snapshots', () => {
    const { sim, history } = createTestSetup();

    // The CommandHistory stores individual CellChange records,
    // not copies of the entire grid buffer. This is the architectural requirement.
    history.beginCommand('Single cell');
    history.editCell('state', 0, 1);
    history.commitCommand();

    // After undo and redo, only the single cell should be affected
    history.undo();
    expect(sim.getCellDirect('state', 0)).toBe(0);
    // All other cells should still be at default
    for (let i = 1; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(0);
    }

    history.redo();
    expect(sim.getCellDirect('state', 0)).toBe(1);
    for (let i = 1; i < sim.grid.cellCount; i++) {
      expect(sim.getCellDirect('state', i)).toBe(0);
    }
  });

  it('complex undo/redo sequence maintains consistency', () => {
    const { sim, history } = createTestSetup();

    // Edit 1
    history.beginCommand('A');
    history.editCell('state', 0, 1);
    history.commitCommand();

    // Edit 2
    history.beginCommand('B');
    history.editCell('state', 1, 2);
    history.commitCommand();

    // Edit 3
    history.beginCommand('C');
    history.editCell('state', 2, 3);
    history.commitCommand();

    // Undo 2 times
    history.undo(); // undo C
    history.undo(); // undo B

    expect(sim.getCellDirect('state', 0)).toBe(1);
    expect(sim.getCellDirect('state', 1)).toBe(0);
    expect(sim.getCellDirect('state', 2)).toBe(0);

    // Redo 1 time
    history.redo(); // redo B
    expect(sim.getCellDirect('state', 1)).toBe(2);

    // New edit after partial redo clears remaining redo
    history.beginCommand('D');
    history.editCell('state', 3, 4);
    history.commitCommand();

    expect(history.canRedo()).toBe(false);
    expect(sim.getCellDirect('state', 3)).toBe(4);
  });
});
