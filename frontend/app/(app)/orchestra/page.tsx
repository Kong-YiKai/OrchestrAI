'use client';

import { useState, useEffect, useMemo } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { RecentProjectsPanel } from '@/components/orchestra/RecentProjectsPanel';
import { ChatThread } from '@/components/orchestra/ChatThread';
import { ContextPanel } from '@/components/orchestra/ContextPanel';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { useSocket } from '@/hooks/useSocket';
import { getSocket } from '@/lib/socket';
import { resumeSession } from '@/lib/api';

const RECENT_PANEL_WIDTH = 280;
const CONTEXT_PANEL_WIDTH = 360;

export default function OrchestraPage() {
  const [activeId, setActiveId] = useState('wx');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);

  const setSessionId = useOrchestraStore((s) => s.setSessionId);
  const hydrateCheckpoint = useOrchestraStore((s) => s.hydrateCheckpoint);

  const sessionId = useMemo(() => {
    if (typeof window === 'undefined') return 'default';
    const stored = localStorage.getItem('orchestrai_session');
    if (stored) return stored;
    const id = `session_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem('orchestrai_session', id);
    return id;
  }, []);

  useSocket(sessionId);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('join_session', { session_id: sessionId });
    setSessionId(sessionId);
    void resumeSession(sessionId)
      .then((response) => {
        if (response.status === 'resumed' && response.state) {
          hydrateCheckpoint(response.state);
        }
      })
      .catch(() => {
        // Resume is best-effort; a missing backend checkpoint should not block chat.
      });
  }, [hydrateCheckpoint, sessionId, setSessionId]);

  return (
    <div className="relative flex h-full overflow-hidden bg-canvas-soft">
      {/* Ambient tint */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(800px 500px at 20% 0%, rgba(255,179,71,0.08) 0%, transparent 60%)',
        }}
      />

      {/* Left: Recent Projects (collapsible) */}
      <AnimatePresence initial={false}>
        {!leftCollapsed && (
          <motion.aside
            key="left"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: RECENT_PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex-shrink-0 overflow-hidden border-r border-hairline bg-glass"
          >
            <div style={{ width: RECENT_PANEL_WIDTH }} className="h-full">
              <RecentProjectsPanel activeId={activeId} onSelect={setActiveId} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Middle: Chat thread */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatThread
          contextOpen={contextOpen}
          onToggleContext={() => setContextOpen((v) => !v)}
          leftCollapsed={leftCollapsed}
          onToggleLeft={() => setLeftCollapsed((v) => !v)}
        />
      </div>

      {/* Right: Context Panel */}
      <AnimatePresence initial={false}>
        {contextOpen && (
          <motion.aside
            key="right"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: CONTEXT_PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex-shrink-0 overflow-hidden"
          >
            <div style={{ width: CONTEXT_PANEL_WIDTH }} className="h-full">
              <ContextPanel />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
