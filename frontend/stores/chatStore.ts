import { create } from 'zustand';
import type { ChatMessage } from '@/types/chat';

interface ChatStore {
  messages: ChatMessage[];
  streamingMessages: Record<string, string>;  // plain object instead of Map
  typingAIs: string[];                        // plain array instead of Set

  addMessage: (msg: ChatMessage) => void;
  appendToken: (messageId: string, token: string, senderId: string) => void;
  commitStreaming: (messageId: string) => void;
  setTyping: (senderId: string, isTyping: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  streamingMessages: {},
  typingAIs: [],

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  appendToken: (messageId, token) =>
    set((state) => ({
      streamingMessages: {
        ...state.streamingMessages,
        [messageId]: (state.streamingMessages[messageId] || '') + token,
      },
    })),

  commitStreaming: (messageId) =>
    set((state) => {
      const next = { ...state.streamingMessages };
      delete next[messageId];
      return { streamingMessages: next };
    }),

  setTyping: (senderId, isTyping) =>
    set((state) => {
      if (isTyping) {
        if (state.typingAIs.includes(senderId)) return {};
        return { typingAIs: [...state.typingAIs, senderId] };
      }
      return { typingAIs: state.typingAIs.filter((id) => id !== senderId) };
    }),

  clearMessages: () => set({ messages: [], streamingMessages: {} }),
}));
