'use client';

import {
  Activity,
  Cpu,
  Database,
  Hash,
  Network,
  Workflow,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { HeroCard } from '@/components/dashboard/HeroCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { ProjectCard } from '@/components/dashboard/ProjectCard';

const sectionAnim = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-8 py-8">
        <HeroCard />

        {/* Stats grid */}
        <motion.div
          variants={sectionAnim}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          <StatCard
            label="Active AIs"
            value="47"
            delta="+3 this week"
            iconTone="warning"
            icon={<Cpu className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
          <StatCard
            label="Live Orchestras"
            value="12"
            delta="+2 since yesterday"
            iconTone="success"
            icon={<Network className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
          <StatCard
            label="Saved Workflows"
            value="1,439"
            iconTone="success"
            icon={<Database className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
          <StatCard
            label="Token Usage"
            value="1.2M"
            delta="68% of monthly"
            iconTone="brand"
            icon={<Activity className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
        </motion.div>

        {/* Section heading */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-ink">
              Active Projects
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Recently collaborated orchestras across your workspace
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[12px] font-medium text-ink-soft ring-1 ring-hairline shadow-card transition-all hover:shadow-card-md hover:text-ink focus-ring"
          >
            View all
          </button>
        </div>

        {/* Projects */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProjectCard
            icon={<Hash className="h-5 w-5" strokeWidth={1.8} />}
            title="Launch Campaign Taskforce"
            description="Coordinate product launch narrative across Claude, GPT, and Gemini. Share assets and review cadence."
            memberCount={5}
            online
            action="menu"
          />
          <ProjectCard
            icon={<Workflow className="h-5 w-5" strokeWidth={1.8} />}
            title="Visual Workflow Builder"
            description="Design AI pipelines by drag-and-drop. Wire nodes, run parallel agents, and export executable flows."
            action="play"
          />
        </div>
      </div>
    </div>
  );
}
