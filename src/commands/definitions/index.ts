/**
 * Command definitions module.
 *
 * registerAllCommands() is the single entry point for wiring all commands
 * at app initialization. This ensures every action is registered before
 * any surface (GUI, CLI, AI) tries to invoke it.
 */

import type { CommandRegistry } from '../CommandRegistry';
import type { SimulationController } from '../SimulationController';
import type { EventBus } from '../../engine/core/EventBus';
import { registerSimCommands } from './sim';
import { registerPresetCommands } from './preset';
import { registerViewCommands } from './view';
import { registerEditCommands } from './edit';
import { registerUiCommands } from './ui';
import { registerParamCommands } from './param';
import { registerGridCommands } from './grid';
import { registerRuleCommands } from './rule';
import { registerLayoutCommands } from './layout';
import { registerVariableCommands } from './variable';
import { registerExpressionCommands } from './expression';
import { registerScriptCommands } from './script';
import { registerLinkCommands } from './link';
import { registerTagCommands } from './tag';

/**
 * Register all commands in the registry.
 * Called once at app initialization.
 */
export function registerAllCommands(
  registry: CommandRegistry,
  controller: SimulationController,
  eventBus: EventBus,
): void {
  registerSimCommands(registry, controller);
  registerPresetCommands(registry, controller);
  registerViewCommands(registry, eventBus);
  registerEditCommands(registry, controller, eventBus);
  registerUiCommands(registry, eventBus);
  registerParamCommands(registry, controller);
  registerGridCommands(registry, controller);
  registerRuleCommands(registry, controller);
  registerLayoutCommands(registry);
  registerVariableCommands(registry, controller);
  registerExpressionCommands(registry, controller, eventBus);
  registerScriptCommands(registry, controller);
  registerLinkCommands(registry, controller, eventBus);
  registerTagCommands(registry, controller, eventBus);
}
