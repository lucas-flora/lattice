/**
 * AI assistant state store.
 *
 * Manages chat history, loading state, and command suggestions.
 * Wired up in Phase 8 when the AI surface is built.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AiState {
  /** Chat message history */
  chatHistory: ChatMessage[];
  /** Whether an AI response is being streamed */
  isLoading: boolean;
}

export const useAiStore = create<AiState>()(
  subscribeWithSelector((): AiState => ({
    chatHistory: [],
    isLoading: false,
  })),
);

/** Store actions -- ready for Phase 8 AI event wiring */
export const aiStoreActions = {
  setLoading: (isLoading: boolean): void => {
    useAiStore.setState({ isLoading });
  },
  addMessage: (msg: ChatMessage): void => {
    useAiStore.setState((state) => ({
      chatHistory: [...state.chatHistory, msg],
    }));
  },
};
