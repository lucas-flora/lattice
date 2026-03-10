/**
 * Rule execution module.
 *
 * Provides the RuleRunner (perceive-update engine), Simulation facade,
 * CommandHistory (undo/redo with sparse diffs), and rule compilation.
 */
export { RuleRunner } from './RuleRunner';
export { Simulation } from './Simulation';
export { CommandHistory } from './CommandHistory';
export { compileRule, validateCompiledRule } from './RuleCompiler';
export type {
  RuleContext,
  RuleFn,
  TickResult,
  IRuleRunner,
  SimulationSetup,
} from './types';
export type { Command, CellChange } from './CommandHistory';
