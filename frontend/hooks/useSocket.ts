'use client';
import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { fetchWorkflow } from '@/lib/api';
import { useChatStore } from '@/stores/chatStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useOrchestraStore } from '@/stores/orchestraStore';
import type { ChatMessage } from '@/types/chat';
import type { WorkflowNode, NodeResult } from '@/types/workflow';
import type { ClarificationQuestion, BuildingLog, HistoryEntry, Plan } from '@/stores/orchestraStore';

export function useSocket(sessionId: string) {
  const initialized = useRef(false);
  const { addMessage, appendToken, commitStreaming, setTyping } = useChatStore();
  const {
    addNode,
    setWorkflow,
    updateNodeStatus,
    updateNodeResult,
    updateNodeError,
    appendNodeLog,
    setExecuting,
    workflowId,
  } = useWorkflowStore();
  const orchestra = useOrchestraStore();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    socket.connect();

    socket.on('connect', () => {
      console.log('[socket] connected', socket.id);
      socket.emit('join_session', { session_id: sessionId });
    });

    socket.on('disconnect', () => {
      console.log('[socket] disconnected');
    });

    // ── Chat events ──────────────────────────────────────────────────────────
    socket.on('chat:message', (msg: ChatMessage) => {
      // If this message was being streamed, commit it now
      commitStreaming(msg.message_id);
      addMessage(msg);
    });

    socket.on('chat:stream_token', ({ message_id, token, sender_id }: { message_id: string; token: string; sender_id: string }) => {
      appendToken(message_id, token, sender_id);
    });

    socket.on('chat:typing', ({ sender_id, is_typing }: { sender_id: string; is_typing: boolean }) => {
      setTyping(sender_id, is_typing);
    });

    // ── Workflow events ──────────────────────────────────────────────────────
    socket.on('workflow:node_appeared', (node: WorkflowNode) => {
      addNode(node);
    });

    socket.on('workflow:generation_complete', ({ workflow_id }: { workflow_id: string }) => {
      useWorkflowStore.setState((s) => ({
        workflowId: workflow_id,
        workflow: s.workflow ? { ...s.workflow, workflow_id } : null,
      }));
    });

    // ── Phase 3: Orchestra events ────────────────────────────────────────────
    socket.on('chat:stream_start', ({ message_id, sender }: { message_id: string; sender: string }) => {
      orchestra.addMessage({
        message_id,
        sender: { id: sender, name: sender === 'claude' ? 'Claude' : 'OrchestrAI', avatar: '', model: '', color: sender === 'claude' ? '#D97706' : '#EC4899' },
        content: '',
        message_type: 'text',
        timestamp: new Date().toISOString(),
        is_streaming: true,
      });
    });

    socket.on('chat:stream_token', ({ message_id, token }: { message_id: string; token: string }) => {
      orchestra.appendStreamToken(message_id, token);
    });

    socket.on('chat:stream_end', ({ message_id, content }: { message_id: string; content: string }) => {
      orchestra.finalizeStream(message_id, content);
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      orchestra.addMessage(msg);
    });

    socket.on('clarification:update', ({ questions }: { questions: ClarificationQuestion[] }) => {
      orchestra.setClarifications(questions);
      orchestra.setConvState('clarifying');
      orchestra.setPendingPanelView('clarifications');
    });

    socket.on('clarification:plan_ready', ({ plan }: { plan: Plan }) => {
      orchestra.setPlan(plan);
      orchestra.setConvState('awaiting_confirm');
    });

    socket.on('building:started', () => {
      orchestra.setConvState('generating');
      orchestra.setPendingPanelView('building');
    });

    socket.on('building:log', (log: BuildingLog) => {
      orchestra.addBuildingLog(log);
    });

    socket.on('building:complete', () => {
      orchestra.setBuildingComplete();
    });

    socket.on('workflow:ready', async ({ workflow_id }: { workflow_id: string; title: string; node_count: number }) => {
      orchestra.setReadyWorkflowId(workflow_id);
      orchestra.setConvState('complete');
      const wf = await fetchWorkflow(workflow_id);
      if (wf) {
        setWorkflow(wf);
      }
    });

    socket.on('history:update', ({ entries }: { entries: HistoryEntry[] }) => {
      orchestra.setHistoryEntries(entries);
    });

    // ── Execution events ─────────────────────────────────────────────────────
    socket.on('execution:node_started', ({ node_id }: { node_id: string }) => {
      updateNodeStatus(node_id, 'running');
    });

    socket.on('execution:node_log', ({ node_id, log_line }: { node_id: string; log_line: string }) => {
      appendNodeLog(node_id, log_line);
    });

    socket.on('execution:node_complete', ({ node_id, result, execution_method }: { node_id: string; result: NodeResult; execution_method: string }) => {
      updateNodeResult(node_id, result, execution_method);
    });

    socket.on('execution:node_error', ({ node_id, error }: { node_id: string; error: string }) => {
      updateNodeError(node_id, error);
    });

    socket.on('execution:workflow_complete', () => {
      setExecuting(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('chat:message');
      socket.off('chat:stream_token');
      socket.off('chat:stream_start');
      socket.off('chat:stream_end');
      socket.off('chat:typing');
      socket.off('workflow:node_appeared');
      socket.off('workflow:generation_complete');
      socket.off('clarification:update');
      socket.off('clarification:plan_ready');
      socket.off('building:started');
      socket.off('building:log');
      socket.off('building:complete');
      socket.off('workflow:ready');
      socket.off('history:update');
      socket.off('execution:node_started');
      socket.off('execution:node_log');
      socket.off('execution:node_complete');
      socket.off('execution:node_error');
      socket.off('execution:workflow_complete');
      socket.disconnect();
      initialized.current = false;
    };
  }, [sessionId]);

  const sendMessage = (content: string) => {
    const socket = getSocket();
    socket.emit('chat_send', { content, session_id: sessionId });
  };

  const confirmStart = (sid: string) => {
    const socket = getSocket();
    socket.emit('chat_confirm_start', { session_id: sid });
  };

  return { sendMessage, confirmStart };
}
