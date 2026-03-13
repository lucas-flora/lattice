/**
 * Panel registration: registers all built-in panel types with the PanelRegistry.
 *
 * Each panel wraps an existing component, adapting its props to the PanelProps interface.
 * Called once during app initialization.
 */

import { panelRegistry } from './PanelRegistry';
import { ViewportPanel } from '../components/panels/ViewportPanel';
import { TerminalPanel } from '../components/panels/TerminalPanel';
import { ParamPanelWrapper } from '../components/panels/ParamPanelWrapper';

export function registerPanels(): void {
  panelRegistry.register({
    type: 'viewport',
    label: 'Viewport',
    component: ViewportPanel,
    allowMultiple: true,
  });

  panelRegistry.register({
    type: 'terminal',
    label: 'Terminal',
    component: TerminalPanel,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'paramPanel',
    label: 'Environment',
    component: ParamPanelWrapper,
    allowMultiple: false,
  });
}
