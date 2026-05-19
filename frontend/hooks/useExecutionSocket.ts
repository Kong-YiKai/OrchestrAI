'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { useWorkflowStore } from '@/stores/workflowStore';
import { toExecutionMethod, type NodeResult } from '@/types/workflow';

/**
 * Scoped Socket.io binding used by the workflow detail page.
 *
 * Subscribes only to the `execution:*` channel so it coexists cleanly with
 * the full `useSocket` hook on the Orchestra page — deep-linking into
 * `/workflows/[id]` should be enough to see node cards transition through
 * queued → running → complete during a run, without pulling in chat and
 * clarification handlers that page doesn't need.
 *
 * The shared singleton in `lib/socket.ts` means joining the session here
 * lands in the same room the backend emits to.
 */
export function useExecutionSocket(sessionId: string | null) {
  const initialized = useRef(false);
  const { updateNodeStatus, updateNodeResult, updateNodeError, appendNodeLog, setExecuting } =
    useWorkflowStore();

  useEffect(() => {
    if (!sessionId) return;
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();

    const handleConnect = () => {
      socket.emit('join_session', { session_id: sessionId });
    };

    socket.on('connect', handleConnect);

    socket.on('execution:node_started', ({ node_id }: { node_id: string }) => {
      updateNodeStatus(node_id, 'running');
    });

    socket.on(
      'execution:node_log',
      ({ node_id, log_line }: { node_id: string; log_line: string }) => {
        appendNodeLog(node_id, log_line);
      },
    );

    socket.on(
      'execution:node_complete',
      ({
        node_id,
        result,
        execution_method,
      }: {
        node_id: string;
        result: NodeResult;
        execution_method: string;
      }) => {
        updateNodeResult(node_id, result, toExecutionMethod(execution_method));
      },
    );

    socket.on(
      'execution:node_error',
      ({ node_id, error }: { node_id: string; error: string }) => {
        updateNodeError(node_id, error);
      },
    );

    socket.on('execution:node_stopping', ({ node_id }: { node_id: string }) => {
      appendNodeLog(node_id, 'Stop requested by user.');
    });

    socket.on(
      'execution:node_stopped',
      ({ node_id, reason }: { node_id: string; reason?: string }) => {
        appendNodeLog(node_id, reason === 'user_requested' ? 'Node stopped by user.' : 'Node stopped.');
        updateNodeStatus(node_id, 'idle');
      },
    );

    socket.on('execution:workflow_complete', () => {
      setExecuting(false);
    });

    // If the socket is already connected (e.g. Orchestra page already opened
    // it), fire the join immediately; otherwise wait for the connect event.
    if (socket.connected) {
      socket.emit('join_session', { session_id: sessionId });
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('execution:node_started');
      socket.off('execution:node_log');
      socket.off('execution:node_complete');
      socket.off('execution:node_error');
      socket.off('execution:node_stopping');
      socket.off('execution:node_stopped');
      socket.off('execution:workflow_complete');
      initialized.current = false;
    };
  }, [sessionId, updateNodeStatus, updateNodeResult, updateNodeError, appendNodeLog, setExecuting]);
}
