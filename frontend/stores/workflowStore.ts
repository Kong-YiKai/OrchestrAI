import { create } from 'zustand';
import type { Workflow, WorkflowNode, NodeStatus, NodeResult } from '@/types/workflow';

interface WorkflowStore {
  workflow: Workflow | null;
  viewMode: 'cards' | 'graph';
  isExecuting: boolean;
  newNodeIds: string[];          // plain array instead of Set
  nodeLogs: Record<string, string[]>;  // plain object instead of Map
  workflowId: string | null;

  setWorkflow: (w: Workflow) => void;
  addNode: (node: WorkflowNode) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  updateNodeResult: (nodeId: string, result: NodeResult, method: string) => void;
  updateNodeError: (nodeId: string, error: string) => void;
  appendNodeLog: (nodeId: string, line: string) => void;
  setViewMode: (mode: 'cards' | 'graph') => void;
  swapNodeModel: (nodeId: string, model: string) => void;
  setExecuting: (v: boolean) => void;
  markNodeOld: (nodeId: string) => void;
  clearWorkflow: () => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflow: null,
  viewMode: 'cards',
  isExecuting: false,
  newNodeIds: [],
  nodeLogs: {},
  workflowId: null,

  setWorkflow: (w) => set({ workflow: w, workflowId: w.workflow_id }),

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
              ? { ...n, status: 'complete' as NodeStatus, result, execution_method: method as any }
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
