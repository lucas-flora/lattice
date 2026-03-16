/**
 * Command system module.
 *
 * The CommandRegistry is the architectural hub -- every app action registered
 * as a command, invocable by GUI, CLI, and AI surfaces alike.
 */

export { CommandRegistry, commandRegistry } from './CommandRegistry';
export { SimulationController } from './SimulationController';
export { SimulationManager, DEFAULT_ROOT_ID } from './SimulationManager';
export { SimulationInstance } from './SimulationInstance';
export { registerAllCommands } from './definitions';
export { wireStores } from './wireStores';
export type { CommandDefinition, CommandResult, CommandCatalogEntry } from './types';
