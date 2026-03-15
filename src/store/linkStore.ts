/**
 * Link state store.
 *
 * UI-facing mirror of LinkRegistry state. Updated via EventBus wiring.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ParameterLink } from '../engine/linking/types';

export interface LinkState {
  links: ParameterLink[];
}

const initialLinkState: LinkState = {
  links: [],
};

export const useLinkStore = create<LinkState>()(
  subscribeWithSelector((): LinkState => ({ ...initialLinkState })),
);

export const linkStoreActions = {
  addLink: (link: ParameterLink): void => {
    useLinkStore.setState((s) => ({
      links: [...s.links, link],
    }));
  },

  removeLink: (id: string): void => {
    useLinkStore.setState((s) => ({
      links: s.links.filter((l) => l.id !== id),
    }));
  },

  updateLink: (id: string, enabled: boolean): void => {
    useLinkStore.setState((s) => ({
      links: s.links.map((l) => (l.id === id ? { ...l, enabled } : l)),
    }));
  },

  setLinks: (links: ParameterLink[]): void => {
    useLinkStore.setState({ links });
  },

  resetAll: (): void => {
    useLinkStore.setState({ ...initialLinkState });
  },
};
