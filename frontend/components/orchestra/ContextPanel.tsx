'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useOrchestraStore, type ContextView } from '@/stores/orchestraStore';
import { OverviewList } from './context/OverviewList';
import { ClarificationsList } from './context/ClarificationsList';
import { ClarificationDetail } from './context/ClarificationDetail';
import { PlanDetail } from './context/PlanDetail';
import { BuildingProcessList } from './context/BuildingProcessList';
import { BuildingAgentDetail } from './context/BuildingAgentDetail';
import { AgentReports } from './context/AgentReports';
import { HistoryTimeline } from './context/HistoryTimeline';

export type ContextPanelNav = {
  goTo: (next: ContextView) => void;
  goBack: (to: ContextView) => void;
};

export function ContextPanel() {
  const view = useOrchestraStore((s) => s.contextView);
  const direction = useOrchestraStore((s) => s.contextDirection);
  const setContextView = useOrchestraStore((s) => s.setContextView);

  const nav: ContextPanelNav = {
    goTo: (next) => setContextView(next, 1),
    goBack: (to) => setContextView(to, -1),
  };

  return (
    <div className="relative flex h-full flex-col border-l border-hairline bg-glass">
      {view.name === 'overview' && (
        <div className="border-b border-hairline px-5 pb-4 pt-5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
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

function viewKey(view: ContextView): string {
  if (view.name === 'clarification-agent') return `clarification-agent:${view.agentId}`;
  if (view.name === 'building-agent') return `building-agent:${view.agentId}`;
  return view.name;
}

const slideVariants = {
  initial: (dir: 1 | -1) => ({ x: 20 * dir, opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (dir: 1 | -1) => ({ x: -20 * dir, opacity: 0 }),
};

function renderView(view: ContextView, nav: ContextPanelNav) {
  switch (view.name) {
    case 'overview':
      return <OverviewList nav={nav} />;
    case 'clarifications':
      return <ClarificationsList nav={nav} />;
    case 'clarification-agent':
      return <ClarificationDetail nav={nav} agentId={view.agentId} />;
    case 'plan-detail':
      return <PlanDetail nav={nav} />;
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
