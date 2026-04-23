import { create } from 'zustand';
import type {
  Workflow,
  WorkflowNode,
  NodeStatus,
  NodeResult,
  ExecutionMethod,
} from '@/types/workflow';
import { fetchWorkflow } from '@/lib/api';

interface WorkflowStore {
  workflow: Workflow | null;
  viewMode: 'cards' | 'graph';
  isExecuting: boolean;
  newNodeIds: string[];          // plain array instead of Set
  nodeLogs: Record<string, string[]>;  // plain object instead of Map
  workflowId: string | null;
  isLoading: boolean;

  setWorkflow: (w: Workflow) => void;
  loadWorkflow: (id: string) => Promise<Workflow | null>;
  addNode: (node: WorkflowNode) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  updateNodeResult: (nodeId: string, result: NodeResult, method: ExecutionMethod) => void;
  updateNodeError: (nodeId: string, error: string) => void;
  appendNodeLog: (nodeId: string, line: string) => void;
  setViewMode: (mode: 'cards' | 'graph') => void;
  swapNodeModel: (nodeId: string, model: string) => void;
  setExecuting: (v: boolean) => void;
  markNodeOld: (nodeId: string) => void;
  clearWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflow: null,
  viewMode: 'cards',
  isExecuting: false,
  newNodeIds: [],
  nodeLogs: {},
  workflowId: null,
  isLoading: false,

  setWorkflow: (w) => set({ workflow: w, workflowId: w.workflow_id }),

  loadWorkflow: async (id): Promise<Workflow | null> => {
    // Skip refetch if the requested workflow is already loaded.
    const current = get();
    if (current.workflow && current.workflowId === id) return current.workflow;

    set({ isLoading: true });
    try {
      const wf = await fetchWorkflow(id);
      if (wf) {
        // Reset transient per-workflow state (new-node flashes, per-node logs
        // from a previous session) so we don't leak into the next workflow.
        set({
          workflow: wf,
          workflowId: wf.workflow_id,
          newNodeIds: [],
          nodeLogs: {},
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
      return wf;
    } catch (err) {
      console.error('[workflowStore] loadWorkflow failed', err);
      set({ isLoading: false });
      return null;
    }
  },

  addNode: (node) =>
    set((state) => {
      const newNodeIds = [...state.newNodeIds, node.node_id];

      if (!state.workflow) {
        return {
          workflow: {
            workflow_id: '',
            title: '',
            title_zh: '',
            description: '',
            nodes: [node],
            created_at: '',
          },
          newNodeIds,
        };
      }

      return {
        workflow: {
          ...state.workflow,
          nodes: [...state.workflow.nodes, node],
        },
        newNodeIds,
      };
    }),

  updateNodeStatus: (nodeId, status) =>
    set((state) => {
      if (!state.workflow) return {};
      return {
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.map((n) =>
            n.node_id === nodeId ? { ...n, status } : n
          ),
        },
      };
    }),

  updateNodeResult: (nodeId, result, method) =>
    set((state) => {
      if (!state.workflow) return {};
      return {
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.map((n) =>
            n.node_id === nodeId
              ? { ...n, status: 'complete' as NodeStatus, result, execution_method: method }
              : n
          ),
        },
      };
    }),

  updateNodeError: (nodeId, error) =>
    set((state) => {
      if (!state.workflow) return {};
      return {
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.map((n) =>
            n.node_id === nodeId ? { ...n, status: 'error' as NodeStatus, error } : n
          ),
        },
      };
    }),

  appendNodeLog: (nodeId, line) =>
    set((state) => ({
      nodeLogs: {
        ...state.nodeLogs,
        [nodeId]: [...(state.nodeLogs[nodeId] || []), line],
      },
    })),

  setViewMode: (mode) => set({ viewMode: mode }),

  swapNodeModel: (nodeId, model) =>
    set((state) => {
      if (!state.workflow) return {};
      return {
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.map((n) =>
            n.node_id === nodeId ? { ...n, assigned_ai: model } : n
          ),
        },
      };
    }),

  setExecuting: (v) => set({ isExecuting: v }),

  markNodeOld: (nodeId) =>
    set((state) => ({
      newNodeIds: state.newNodeIds.filter((id) => id !== nodeId),
    })),

  clearWorkflow: () =>
    set({
      workflow: null,
      workflowId: null,
      isExecuting: false,
      newNodeIds: [],
      nodeLogs: {},
    }),
}));
