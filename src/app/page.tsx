/**
 * Lattice main page.
 *
 * Renders the AppShell which integrates all surfaces:
 * viewport, controls, terminal, HUD, preset selector, and parameter panel.
 */

'use client';

import { AppShell } from '@/components/AppShell';

export default function Home() {
  return <AppShell />;
}
