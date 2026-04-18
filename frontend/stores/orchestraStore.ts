import { create } from 'zustand';
import type { ChatMessage } from '@/types/chat';

export type ConvState = 'idle' | 'clarifying' | 'awaiting_confirm' | 'generating' | 'complete';

export interface ClarificationQuestion {
  id: string;
  question: string;
  hint?: string;
  answer?: string;
  status: 'pending' | 'answered';
}

export interface PlanNode {
  order: number;
  title: string;
  description: string;
  recommended_ai: string;
}

export interface Plan {
  title: string;
  summary: string;
  nodes: PlanNode[];
  confirmation_prompt: string;
}

export interface BuildingLog {
  log_id: string;
  timestamp: string;
  type: 'thinking' | 'analyzing' | 'generating' | 'deciding' | 'done' | 'error';
  message: string;
  detail?: string;
  agent?: string;
}

export interface HistoryEntry {
  entry_id: string;
  timestamp: string;
  action: string;
  detail?: string;
}

interface OrchestraStore {
  sessionId: string;
  convState: ConvState;
  pendingPanelView: string | null;

  messages: ChatMessage[];
  streamingBuffers: Record<string, string>;

  clarificationQuestions: ClarificationQuestion[];
  plan: Plan | null;

  buildingLogs: BuildingLog[];
  isBuildingComplete: boolean;

  historyEntries: HistoryEntry[];
  readyWorkflowId: string | null;

  setSessionId: (id: string) => void;
  setConvState: (s: ConvState) => void;
  setPendingPanelView: (view: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  appendStreamToken: (messageId: string, token: string) => void;
  finalizeStream: (messageId: string, content: string) => void;
  setClarifications: (questions: ClarificationQuestion[]) => void;
  setPlan: (plan: Plan) => void;
  addBuildingLog: (log: BuildingLog) => void;
  setBuildingComplete: () => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  setReadyWorkflowId: (id: string) => void;
  reset: () => void;
}

const initialState = {
  sessionId: 'default',
  convState: 'idle' as ConvState,
  pendingPanelView: null,
  messages: [] as ChatMessage[],
  streamingBuffers: {} as Record<string, string>,
  clarificationQuestions: [] as ClarificationQuestion[],
  plan: null,
  buildingLogs: [] as BuildingLog[],
  isBuildingComplete: false,
  historyEntries: [] as HistoryEntry[],
  readyWorkflowId: null,
};

export const useOrchestraStore = create<OrchestraStore>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setConvState: (s) => set({ convState: s }),
  setPendingPanelView: (view) => set({ pendingPanelView: view }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  appendStreamToken: (messageId, token) =>
    set((state) => ({
      streamingBuffers: {
        ...state.streamingBuffers,
        [messageId]: (state.streamingBuffers[messageId] ?? '') + token,
      },
    })),

  finalizeStream: (messageId, content) =>
    set((state) => {
      const buffers = { ...state.streamingBuffers };
      delete buffers[messageId];
      const messages = state.messages.map((m) =>
        m.message_id === messageId ? { ...m, content, is_streaming: false } : m
      );
      return { streamingBuffers: buffers, messages };
    }),

  setClarifications: (questions) => set({ clarificationQuestions: questions }),
  setPlan: (plan) => set({ plan }),

  addBuildingLog: (log) =>
    set((state) => ({ buildingLogs: [...state.buildingLogs, log] })),

  setBuildingComplete: () => set({ isBuildingComplete: true }),

  addHistoryEntry: (entry) =>
    set((state) => ({ historyEntries: [...state.historyEntries, entry] })),

  setReadyWorkflowId: (id) => set({ readyWorkflowId: id }),

  reset: () => set(initialState),
}));
