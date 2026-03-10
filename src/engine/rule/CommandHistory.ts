/**
 * Command pattern undo/redo with sparse diffs.
 *
 * Each Command records only the cells that changed (not full grid snapshots).
 * This keeps memory proportional to edit count, not grid size.
 *
 * Implements CTRL-07: Undo/redo using Command pattern.
 */

import type { Simulation } from './Simulation';

/** A single cell change record */
export interface CellChange {
  propertyName: string;
  index: number;
  channel: number;
  oldValue: number;
  newValue: number;
}

/** A command represents one logical user action (one or more cell changes) */
export interface Command {
  /** Human-readable description */
  label: string;
  /** The sparse diff of cell changes */
  changes: CellChange[];
}

/**
 * CommandHistory manages an undo/redo stack for cell edits.
 *
 * Usage:
 *   const history = new CommandHistory(simulation);
 *   history.beginCommand("Draw cell");
 *   history.editCell("alive", index, 1);  // records old value automatically
 *   history.commitCommand();
 *   history.undo();  // reverts to old value
 *   history.redo();  // re-applies new value
 */
export class CommandHistory {
  private simulation: Simulation;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private pendingCommand: Command | null = null;

  constructor(simulation: Simulation) {
    this.simulation = simulation;
  }

  /**
   * Begin a new command. All subsequent editCell calls are grouped into this command.
   */
  beginCommand(label: string): void {
    if (this.pendingCommand) {
      throw new Error('Cannot begin a new command while one is pending. Call commitCommand() first.');
    }
    this.pendingCommand = { label, changes: [] };
  }

  /**
   * Edit a cell value, recording the old value for undo.
   * Must be called between beginCommand() and commitCommand().
   */
  editCell(propertyName: string, index: number, newValue: number, channel: number = 0): void {
    if (!this.pendingCommand) {
      throw new Error('No pending command. Call beginCommand() first.');
    }

    const oldValue = this.simulation.getCellDirect(propertyName, index, channel);
    this.pendingCommand.changes.push({
      propertyName,
      index,
      channel,
      oldValue,
      newValue,
    });

    // Apply the edit immediately
    this.simulation.setCellDirect(propertyName, index, newValue, channel);
  }

  /**
   * Commit the pending command to the undo stack.
   * Clears the redo stack (new edits invalidate future redo).
   */
  commitCommand(): void {
    if (!this.pendingCommand) {
      throw new Error('No pending command to commit.');
    }

    // Only add non-empty commands
    if (this.pendingCommand.changes.length > 0) {
      this.undoStack.push(this.pendingCommand);
      this.redoStack = []; // New action invalidates redo history
    }

    this.pendingCommand = null;
  }

  /**
   * Undo the most recent command.
   * Reverts all cell changes in reverse order.
   */
  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;

    // Apply changes in reverse order, using oldValue
    for (let i = command.changes.length - 1; i >= 0; i--) {
      const change = command.changes[i];
      this.simulation.setCellDirect(
        change.propertyName,
        change.index,
        change.oldValue,
        change.channel,
      );
    }

    this.redoStack.push(command);
    return true;
  }

  /**
   * Redo the most recently undone command.
   * Re-applies all cell changes in forward order.
   */
  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;

    // Apply changes in forward order, using newValue
    for (const change of command.changes) {
      this.simulation.setCellDirect(
        change.propertyName,
        change.index,
        change.newValue,
        change.channel,
      );
    }

    this.undoStack.push(command);
    return true;
  }

  /**
   * Check if undo is available.
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Get the number of commands in the undo stack.
   */
  get undoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Get the number of commands in the redo stack.
   */
  get redoCount(): number {
    return this.redoStack.length;
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingCommand = null;
  }
}
