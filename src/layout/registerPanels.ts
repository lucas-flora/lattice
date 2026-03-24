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
import { CellPanel } from '../components/panels/CellPanel';
import { ScriptPanelWrapper } from '../components/panels/ScriptPanelWrapper';
import { ObjectManagerPanel } from '../components/panels/ObjectManagerPanel';
import { InspectorPanel } from '../components/panels/InspectorPanel';
import { CardViewPanel } from '../components/panels/CardViewPanel';
import { NodeEditorPanel } from '../components/panels/NodeEditorPanel';
import { PipelinePanel } from '../components/panels/pipeline/PipelinePanel';

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

  panelRegistry.register({
    type: 'cellPanel',
    label: 'Cells',
    component: CellPanel,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'scriptPanel',
    label: 'Scripts',
    component: ScriptPanelWrapper,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'objectManager',
    label: 'Object Manager',
    component: ObjectManagerPanel,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'inspector',
    label: 'Inspector',
    component: InspectorPanel,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'cardView',
    label: 'Card View',
    component: CardViewPanel,
    allowMultiple: true,
  });

  panelRegistry.register({
    type: 'pipeline',
    label: 'Pipeline',
    component: PipelinePanel,
    allowMultiple: false,
  });

  panelRegistry.register({
    type: 'nodeEditor',
    label: 'Node Editor',
    component: NodeEditorPanel,
    allowMultiple: true,
  });
}
