import { create } from 'zustand';
import type { ChatMessage } from '@/types/chat';

export type ConvState = 'idle' | 'clarifying' | 'awaiting_confirm' | 'generating' | 'complete';

export interface ClarificationOption {
  id: string;
  label: string;
  meta?: string;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  hint?: string;
  answer?: string;
  options?: ClarificationOption[];
  selected_option_id?: string | null;
  custom_answer?: string;
  confirmed?: boolean;
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

export type ContextView =
  | { name: 'overview' }
  | { name: 'clarifications' }
  | { name: 'clarification-agent'; agentId: string }
  | { name: 'building' }
  | { name: 'building-agent'; agentId: string }
  | { name: 'reports' }
  | { name: 'history' };

interface OrchestraStore {
  sessionId: string;
  convState: ConvState;
  contextView: ContextView;
  contextDirection: 1 | -1;

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
  setContextView: (view: ContextView, direction?: 1 | -1) => void;
  addMessage: (msg: ChatMessage) => void;
  appendStreamToken: (messageId: string, token: string) => void;
  finalizeStream: (messageId: string, content: string) => void;
  setClarifications: (questions: ClarificationQuestion[]) => void;
  updateClarificationDraft: (id: string, patch: Partial<ClarificationQuestion>) => void;
  confirmClarifications: () => void;
  setPlan: (plan: Plan) => void;
  addBuildingLog: (log: BuildingLog) => void;
  setBuildingComplete: () => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  setHistoryEntries: (entries: HistoryEntry[]) => void;
  setReadyWorkflowId: (id: string) => void;
  reset: () => void;
}

const initialState = {
  sessionId: 'default',
  convState: 'idle' as ConvState,
  contextView: { name: 'overview' } as ContextView,
  contextDirection: 1 as 1 | -1,
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
  setContextView: (view, direction = 1) =>
    set({ contextView: view, contextDirection: direction }),

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

  updateClarificationDraft: (id, patch) =>
    set((state) => ({
      clarificationQuestions: state.clarificationQuestions.map((q) =>
        q.id === id ? { ...q, ...patch } : q
      ),
    })),

  confirmClarifications: () =>
    set((state) => ({
      clarificationQuestions: state.clarificationQuestions.map((q) => ({
        ...q,
        confirmed: true,
        status: 'answered' as const,
      })),
    })),

  setPlan: (plan) => set({ plan }),

  addBuildingLog: (log) =>
    set((state) => ({ buildingLogs: [...state.buildingLogs, log] })),

  setBuildingComplete: () => set({ isBuildingComplete: true }),

  addHistoryEntry: (entry) =>
    set((state) => ({ historyEntries: [...state.historyEntries, entry] })),

  setHistoryEntries: (entries) => set({ historyEntries: entries }),

  setReadyWorkflowId: (id) => set({ readyWorkflowId: id }),

  reset: () => set(initialState),
}));
