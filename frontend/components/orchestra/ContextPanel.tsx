'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { OverviewList } from './context/OverviewList';
import { ClarificationsList } from './context/ClarificationsList';
import { ClarificationDetail } from './context/ClarificationDetail';
import { BuildingProcessList } from './context/BuildingProcessList';
import { BuildingAgentDetail } from './context/BuildingAgentDetail';
import { AgentReports } from './context/AgentReports';
import { HistoryTimeline } from './context/HistoryTimeline';

type View =
  | { name: 'overview' }
  | { name: 'clarifications' }
  | { name: 'clarification-agent'; agentId: string }
  | { name: 'building' }
  | { name: 'building-agent'; agentId: string }
  | { name: 'reports' }
  | { name: 'history' };

export type ContextPanelNav = {
  goTo: (next: View) => void;
  goBack: (to: View) => void;
};

export function ContextPanel() {
  const [view, setView] = useState<View>({ name: 'overview' });
  const [direction, setDirection] = useState<1 | -1>(1);
  const { pendingPanelView, setPendingPanelView } = useOrchestraStore();

  useEffect(() => {
    if (!pendingPanelView) return;
    const name = pendingPanelView as View['name'];
    setDirection(1);
    setView({ name } as View);
    setPendingPanelView(null);
  }, [pendingPanelView, setPendingPanelView]);

  const nav: ContextPanelNav = {
    goTo: (next) => {
      setDirection(1);
      setView(next);
    },
    goBack: (to) => {
      setDirection(-1);
      setView(to);
    },
  };

  return (
    <div className="flex h-full flex-col border-l border-hairline bg-canvas">
      {view.name === 'overview' && (
        <div className="border-b border-hairline px-5 pb-4 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Project Context
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={viewKey(view)}
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={view.name === 'overview' ? 'px-5 py-5' : ''}
          >
            {renderView(view, nav)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function viewKey(view: View): string {
  if (view.name === 'clarification-agent') return `clarification-agent:${view.agentId}`;
  if (view.name === 'building-agent') return `building-agent:${view.agentId}`;
  return view.name;
}

const slideVariants = {
  initial: (dir: 1 | -1) => ({ x: 20 * dir, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: -20 * dir, opacity: 0 }),
};

function renderView(view: View, nav: ContextPanelNav) {
  switch (view.name) {
    case 'overview':
      return <OverviewList nav={nav} />;
    case 'clarifications':
      return <ClarificationsList nav={nav} />;
    case 'clarification-agent':
      return <ClarificationDetail nav={nav} agentId={view.agentId} />;
    case 'building':
      return <BuildingProcessList nav={nav} />;
    case 'building-agent':
      return <BuildingAgentDetail nav={nav} agentId={view.agentId} />;
    case 'reports':
      return <AgentReports nav={nav} />;
    case 'history':
      return <HistoryTimeline nav={nav} />;
  }
}
