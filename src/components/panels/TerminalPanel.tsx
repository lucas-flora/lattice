/**
 * TerminalPanel: panel wrapper for Terminal.
 *
 * Adapts Terminal to the PanelProps interface for the layout system.
 * Always renders in docked mode when used as a panel.
 */

'use client';

import type { PanelProps } from '@/layout/types';
import { Terminal } from '@/components/terminal/Terminal';

export function TerminalPanel(_props: PanelProps) {
  return <Terminal docked />;
}
