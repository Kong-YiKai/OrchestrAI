import {
  Activity,
  Cpu,
  Database,
  Hash,
  Network,
  Workflow,
} from 'lucide-react';
import { HeroCard } from '@/components/dashboard/HeroCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { ProjectCard } from '@/components/dashboard/ProjectCard';

export default function DashboardPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-6 px-8 py-8">
        <HeroCard />

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active AIs"
            value="47"
            iconTone="warning"
            icon={<Cpu className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
          <StatCard
            label="Live Orchestras"
            value="12"
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
            iconTone="brand"
            icon={<Activity className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          />
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
