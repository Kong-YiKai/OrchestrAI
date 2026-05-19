'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  Code2,
  FilePlus2,
  GitBranch,
  Globe,
  Loader2,
  Lock,
  MessageCircle,
  Paperclip,
  Pencil,
  Play,
  Plug,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { runNode, stopNode, subdivideWorkflowNode, updateWorkflowNode } from '@/lib/api';
import { useWorkflowStore } from '@/stores/workflowStore';
import type { NodeStatus, ToolType, WorkflowNode } from '@/types/workflow';

type DrawerTab = 'configuration' | 'sub-agent-chat';

const MODEL_LABEL: Record<string, string> = {
  claude: 'Claude 4.6',
  gpt: 'GPT-4o',
  gemini: 'Gemini',
  grok: 'Grok',
};

const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  api: 'API',
  web_automation: 'Web Automation',
  llm: 'LLM',
  code: 'Code',
};

const STATUS_TONE: Record<NodeStatus, { label: string; dot: string; chip: string }> = {
  idle: {
    label: 'Queued',
    dot: 'bg-ink-muted',
    chip: 'bg-canvas-soft text-ink-soft ring-hairline',
  },
  running: {
    label: 'Running',
    dot: 'bg-brand-500',
    chip: 'bg-brand-50 text-brand-700 ring-brand-500/25',
  },
  complete: {
    label: 'Complete',
    dot: 'bg-success-500',
    chip: 'bg-success-100 text-success-700 ring-success-500/25',
  },
  error: {
    label: 'Error',
    dot: 'bg-danger-500',
    chip: 'bg-danger-50 text-danger-500 ring-danger-500/25',
  },
};

/* ─────────────── Mock data (visual contract — Phase 6/4.5/10 will replace) ─────────────── */

interface MockPlugin {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  enabled: boolean;
}

const MOCK_PLUGINS: MockPlugin[] = [
  { id: 'fs', name: 'File System', icon: FilePlus2, enabled: true },
  { id: 'web', name: 'Web Search', icon: Globe, enabled: true },
  { id: 'lint', name: 'Linter', icon: Code2, enabled: true },
];

const MOCK_SKILLS = [
  { id: 'bash', name: 'Bash Execution', icon: Terminal },
  { id: 'code', name: 'Code Analysis', icon: Code2 },
] as const;

const PERMISSION_OPTIONS = [
  { value: 'default', label: 'Default (Ask for dangerous ops)' },
  { value: 'auto', label: 'Auto (Run without asking)' },
  { value: 'manual', label: 'Manual (Always ask)' },
] as const;

/* ───────────────────────────────────────────────────────────────────────────── */

interface Props {
  nodeId: string | null;
  onClose: () => void;
}

export function NodeDetailDrawer({ nodeId, onClose }: Props) {
  const node = useWorkflowStore(
    (s) => s.workflow?.nodes.find((n) => n.node_id === nodeId) ?? null,
  );
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const updateNode = useWorkflowStore((s) => s.updateNode);
  const addNodes = useWorkflowStore((s) => s.addNodes);
  const updateNodeStatus = useWorkflowStore((s) => s.updateNodeStatus);

  const [tab, setTab] = useState<DrawerTab>('configuration');
  const [editing, setEditing] = useState(false);
  const [draftNodeId, setDraftNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<WorkflowNode>>({});

  const modelLabel = node ? MODEL_LABEL[node.assigned_ai] ?? node.assigned_ai : '';
  const displayTitle = node?.title || node?.title_zh || '';
  const tone = node ? STATUS_TONE[node.status] : null;
  const isEditing = Boolean(node && editing && draftNodeId === node.node_id);

  const sessionId = () =>
    typeof window !== 'undefined'
      ? localStorage.getItem('orchestrai_session') || 'default'
      : 'default';

  const handleSave = async () => {
    if (!workflowId || !node) return;
    await updateWorkflowNode(workflowId, node.node_id, draft);
    updateNode(node.node_id, draft);
    setEditing(false);
    setDraftNodeId(null);
  };

  const startEditing = () => {
    if (!node) return;
    setDraft({
      title: node.title,
      title_zh: node.title_zh,
      description: node.description,
      description_zh: node.description_zh,
      assigned_ai: node.assigned_ai,
      assigned_tool: node.assigned_tool,
      tool_type: node.tool_type,
      node_type: node.node_type,
      parent_node_id: node.parent_node_id,
      depends_on: node.depends_on,
      parallel_group: node.parallel_group,
      input_schema: node.input_schema,
      output_schema: node.output_schema,
    });
    setDraftNodeId(node.node_id);
    setEditing(true);
  };

  const handleRun = async () => {
    if (!node) return;
    updateNodeStatus(node.node_id, 'idle');
    await runNode(node.node_id, sessionId());
  };

  const handleStop = async () => {
    if (!node) return;
    await stopNode(node.node_id, sessionId());
  };

  const handleSubdivide = async () => {
    if (!workflowId || !node) return;
    const result = await subdivideWorkflowNode(workflowId, node.node_id, { child_count: 4 });
    updateNode(node.node_id, { node_type: 'phase' });
    addNodes(result.nodes);
  };

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key={node.node_id}
          initial={{ x: '100%', opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-0 top-0 z-20 flex h-full w-[min(920px,calc(100%-24px))] flex-col border-l border-hairline bg-surface shadow-overlay"
        >
          {/* Header */}
          <div className="border-b border-hairline px-7 pb-0 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
                  Requirements & Architecture · Order {node.order + 1}
                </p>
                {isEditing ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input
                      value={draft.title ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="English title"
                      className="h-11 w-full rounded-[12px] border border-hairline bg-canvas-soft px-3 text-[20px] font-semibold tracking-tight text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <input
                      value={draft.title_zh ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, title_zh: e.target.value }))}
                      placeholder="中文标题"
                      className="h-11 w-full rounded-[12px] border border-hairline bg-canvas-soft px-3 text-[20px] font-semibold tracking-tight text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                ) : (
                  <h2 className="mt-2 text-[26px] font-semibold tracking-tight text-ink">
                    {displayTitle}
                  </h2>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-500/20">
                    <Sparkles className="h-3 w-3" strokeWidth={2} />
                    {modelLabel}
                  </span>
                  {tone && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ring-1',
                        tone.chip,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                      {tone.label}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={node.status === 'running'}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] font-semibold text-white transition-all hover:bg-[#2b241d] focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5 fill-white" strokeWidth={2.2} />
                  Run Node
                </button>
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={node.status !== 'running'}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-[12px] font-semibold text-ink-soft transition-all hover:border-danger-500/40 hover:text-danger-500 focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Square className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Stop
                </button>
                <button
                  type="button"
                  onClick={handleSubdivide}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-[12px] font-semibold text-ink-soft transition-all hover:border-brand-400 hover:text-ink focus-ring"
                >
                  <GitBranch className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Subdivide
                </button>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={handleSave}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-[12px] font-semibold text-white shadow-brand-glow transition-all hover:bg-brand-600 focus-ring"
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Save
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 text-[12px] font-semibold text-ink-soft transition-all hover:border-brand-400 hover:text-ink focus-ring"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Edit
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-1">
              <TabButton
                active={tab === 'configuration'}
                onClick={() => setTab('configuration')}
                label="Configuration & Permissions"
                icon={<ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
              <TabButton
                active={tab === 'sub-agent-chat'}
                onClick={() => setTab('sub-agent-chat')}
                label="Node Sub-Agent Chat"
                icon={<MessageCircle className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {tab === 'configuration' ? (
              <ConfigurationBody
                node={node}
                editing={isEditing}
                draft={draft}
                setDraft={setDraft}
              />
            ) : (
              <SubAgentChatBody node={node} />
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12px] font-medium transition-colors',
        active ? 'bg-surface text-ink ring-1 ring-hairline' : 'text-ink-muted hover:text-ink-soft',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {active && (
        <motion.span
          layoutId="wf-drawer-tab"
          className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500"
        />
      )}
    </button>
  );
}

/* ─────────────────── Configuration & Permissions tab ─────────────────── */

function ConfigurationBody({
  node,
  editing,
  draft,
  setDraft,
}: {
  node: WorkflowNode;
  editing: boolean;
  draft: Partial<WorkflowNode>;
  setDraft: React.Dispatch<React.SetStateAction<Partial<WorkflowNode>>>;
}) {
  const description = (editing ? draft.description : node.description)?.trim();
  const descriptionZh = (editing ? draft.description_zh : node.description_zh)?.trim();
  const inputEntries = useMemo(() => Object.entries(node.input_schema ?? {}), [node.input_schema]);
  const outputEntries = useMemo(
    () => Object.entries(node.output_schema ?? {}),
    [node.output_schema],
  );
  const [permission, setPermission] = useState<string>('default');

  return (
    <div className="flex flex-col gap-6 p-5">
      {/* Latest run / error — only visible after execution */}
      {node.status === 'error' && (
        <div className="rounded-[14px] border border-danger-500/20 bg-danger-50/40 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger-500" strokeWidth={2} />
            <p className="text-[13px] font-semibold text-danger-500">Execution failed</p>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-[1.6] text-ink-soft">
            {node.error || 'No error message captured.'}
          </p>
        </div>
      )}
      {node.status === 'running' && (
        <div className="rounded-[14px] border border-brand-500/25 bg-brand-50/40 p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" strokeWidth={2} />
            <p className="text-[13px] font-semibold text-brand-700">Running this node…</p>
          </div>
          <p className="mt-1 text-[12px] leading-[1.55] text-ink-muted">
            Output will appear here when the run completes.
          </p>
        </div>
      )}
      {node.status === 'complete' && node.result && (
        <Section title="Latest Run" icon={<CheckCircle2 className="h-3 w-3" strokeWidth={2} />}>
          <div className="space-y-2 rounded-[12px] border border-success-500/20 bg-success-50/35 p-3.5">
            {(node.result.summary_zh || node.result.summary) && (
              <p className="text-[12.5px] leading-[1.6] text-ink">
                {node.result.summary_zh || node.result.summary}
              </p>
            )}
            {node.execution_method && (
              <span className="inline-flex items-center gap-1 rounded-full bg-canvas-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-soft ring-1 ring-hairline">
                {node.execution_method}
              </span>
            )}
          </div>
        </Section>
      )}

      <Section title="Description">
        <div className="space-y-3 rounded-[14px] border border-hairline bg-surface p-4">
          {editing ? (
            <>
              <FieldLabel>中文描述</FieldLabel>
              <textarea
                value={draft.description_zh ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description_zh: e.target.value }))}
                rows={4}
                className="w-full resize-none rounded-[12px] border border-hairline bg-canvas-soft px-3 py-2 text-[14px] leading-[1.6] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <FieldLabel>English Description</FieldLabel>
              <textarea
                value={draft.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={4}
                className="w-full resize-none rounded-[12px] border border-hairline bg-canvas-soft px-3 py-2 text-[14px] leading-[1.6] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </>
          ) : (
            <>
              {descriptionZh && (
                <p className="text-[15px] leading-[1.8] text-ink">{descriptionZh}</p>
              )}
              {description && description !== descriptionZh && (
                <p className="text-[14px] leading-[1.7] text-ink-muted">{description}</p>
              )}
              {!description && !descriptionZh && (
                <p className="text-[13px] italic text-ink-muted">No description provided.</p>
              )}
            </>
          )}
        </div>
      </Section>

      <Section title="Tool Assignment">
        <div className="rounded-[14px] border border-hairline bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex flex-1 items-center gap-2 text-[15px] font-semibold text-ink">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-canvas-soft text-ink-soft">
                <Wrench className="h-3.5 w-3.5" strokeWidth={1.8} />
              </span>
              {editing ? (
                <input
                  value={draft.assigned_tool ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, assigned_tool: e.target.value }))}
                  className="h-10 flex-1 rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[14px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              ) : (
                node.assigned_tool || 'Unassigned'
              )}
            </span>
            {editing ? (
              <select
                value={draft.tool_type ?? node.tool_type}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tool_type: e.target.value as ToolType }))
                }
                className="h-10 rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[13px] font-semibold text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                {Object.entries(TOOL_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-500/20">
                {TOOL_TYPE_LABEL[node.tool_type] ?? node.tool_type}
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Graph Structure" icon={<GitBranch className="h-3 w-3" strokeWidth={2} />}>
        <div className="grid gap-3 rounded-[14px] border border-hairline bg-surface p-4 md:grid-cols-2">
          <GraphField label="Node Type">
            {editing ? (
              <select
                value={draft.node_type ?? node.node_type}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, node_type: e.target.value as WorkflowNode['node_type'] }))
                }
                className="h-10 w-full rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[13px] font-semibold text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="phase">Phase</option>
                <option value="task">Task</option>
              </select>
            ) : (
              <GraphValue>{node.node_type ?? 'task'}</GraphValue>
            )}
          </GraphField>
          <GraphField label="Parent Node">
            {editing ? (
              <input
                value={draft.parent_node_id ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, parent_node_id: e.target.value || null }))
                }
                placeholder="Optional parent node id"
                className="h-10 w-full rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            ) : (
              <GraphValue>{node.parent_node_id || 'None'}</GraphValue>
            )}
          </GraphField>
          <GraphField label="Depends On">
            {editing ? (
              <input
                value={(draft.depends_on ?? []).join(', ')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    depends_on: e.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }))
                }
                placeholder="node_a, node_b"
                className="h-10 w-full rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            ) : (
              <GraphValue>
                {node.depends_on?.length ? node.depends_on.join(', ') : 'No prerequisites'}
              </GraphValue>
            )}
          </GraphField>
          <GraphField label="Parallel Group">
            {editing ? (
              <input
                value={draft.parallel_group ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, parallel_group: e.target.value || null }))
                }
                placeholder="Optional group id"
                className="h-10 w-full rounded-[10px] border border-hairline bg-canvas-soft px-3 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            ) : (
              <GraphValue>{node.parallel_group || 'None'}</GraphValue>
            )}
          </GraphField>
        </div>
      </Section>

      {/* Installed Plugins (mock) */}
      <Section title="Installed Plugins" icon={<Plug className="h-3 w-3" strokeWidth={2} />}>
        <div className="grid gap-7 md:grid-cols-2">
          <CapabilityList
            title="Installed Plugins"
            icon={<Plug className="h-5 w-5" strokeWidth={1.8} />}
            items={MOCK_PLUGINS.map((p) => ({ id: p.id, name: p.name, icon: p.icon }))}
          />
          <CapabilityList
            title="Active Skills"
            icon={<Terminal className="h-5 w-5" strokeWidth={1.8} />}
            items={MOCK_SKILLS.map((s) => ({ id: s.id, name: s.name, icon: s.icon }))}
          />
        </div>
      </Section>

      {/* Required Permissions (mock) */}
      <Section
        title="Required Permissions"
        icon={<ShieldCheck className="h-3 w-3" strokeWidth={2} />}
      >
        <div className="grid items-center gap-6 rounded-[18px] border border-hairline bg-surface p-6 md:grid-cols-[1fr_320px]">
          <div>
            <p className="text-[18px] font-semibold tracking-tight text-ink">
              Execution Authority
            </p>
            <p className="mt-2 max-w-[520px] text-[14px] leading-[1.65] text-ink-muted">
              Choose what this node is allowed to execute automatically. Any tasks outside of this
              scope will be sent to the Orchestra Building Process for manual approval.
            </p>
          </div>
          <div className="relative">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              className="h-12 w-full appearance-none rounded-[12px] border border-hairline bg-canvas-soft pl-4 pr-10 text-[14px] font-semibold text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            >
              {PERMISSION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              strokeWidth={1.8}
            />
          </div>
        </div>
        <p className="mt-2 text-[10.5px] italic text-ink-muted">
          Mock control — backend wiring lands in Phase 4.5.
        </p>
      </Section>

      <Section title="Input Schema" icon={<ArrowDownToLine className="h-3 w-3" strokeWidth={2} />}>
        <SchemaList entries={inputEntries} emptyLabel="No inputs declared." />
      </Section>

      <Section title="Output Schema" icon={<ArrowUpFromLine className="h-3 w-3" strokeWidth={2} />}>
        <SchemaList entries={outputEntries} emptyLabel="No outputs declared." />
      </Section>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
      {children}
    </p>
  );
}

function GraphField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function GraphValue({ children }: { children: React.ReactNode }) {
  return (
    <p className="min-h-10 rounded-[10px] border border-hairline bg-canvas-soft px-3 py-2 text-[13px] font-medium text-ink-soft">
      {children}
    </p>
  );
}

function CapabilityList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: {
    id: string;
    name: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }[];
}) {
  return (
    <div>
      <p className="mb-4 flex items-center gap-2 text-[17px] font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.id}
              className="flex h-[58px] items-center gap-3 rounded-[16px] border border-hairline bg-surface px-4 text-[16px] font-medium text-ink shadow-card"
            >
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-canvas-soft text-ink-soft">
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="flex-1 truncate">{item.name}</span>
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success-500" strokeWidth={2} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SchemaList({ entries, emptyLabel }: { entries: [string, string][]; emptyLabel: string }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-[12px] border border-dashed border-hairline bg-surface/40 px-3.5 py-2.5 text-[12px] italic text-ink-muted">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([key, type]) => (
        <li
          key={key}
          className="flex items-center justify-between gap-3 rounded-[10px] border border-hairline bg-surface px-3 py-2 text-[12.5px]"
        >
          <span className="truncate font-mono text-ink">{key}</span>
          <span className="truncate rounded-md bg-canvas-soft px-1.5 py-0.5 font-mono text-[11.5px] text-ink-soft">
            {type || '—'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────── Node Sub-Agent Chat tab (Phase 10 placeholder) ─────────────────── */

function SubAgentChatBody({ node }: { node: WorkflowNode }) {
  const modelLabel = MODEL_LABEL[node.assigned_ai] ?? node.assigned_ai;

  return (
    <div className="relative flex h-full flex-col">
      {/* Disabled overlay tag */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline bg-canvas-soft/60 px-5 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft ring-1 ring-hairline">
          <GitBranch className="h-3 w-3" strokeWidth={2} />
          Main Thread
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#c06a00] ring-1 ring-warning-500/25">
          <Lock className="h-3 w-3" strokeWidth={2} />
          Phase 10 启用
        </span>
      </div>

      {/* Greeting */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[12px] font-bold text-white ring-2 ring-surface">
            {modelLabel.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[12.5px] font-semibold text-ink">{modelLabel}</span>
              <span className="text-[10.5px] text-ink-muted">Sub-agent</span>
            </div>
            <div className="mt-1 rounded-2xl rounded-tl-sm border border-hairline bg-surface px-4 py-3 text-[13px] leading-[1.6] text-ink-soft shadow-card">
              I am the dedicated agent for this workflow step. I operate independently from the main
              Orchestra window. Ask me anything about my current task execution.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-2.5 py-1 text-[11px] font-medium text-ink-soft ring-1 ring-hairline">
                <Paperclip className="h-3 w-3" strokeWidth={1.8} />
                Files
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas-soft px-2.5 py-1 text-[11px] font-medium text-ink-soft ring-1 ring-hairline">
                <GitBranch className="h-3 w-3" strokeWidth={1.8} />
                Create Parallel Branches
              </span>
            </div>
          </div>
        </div>

        {/* Empty state */}
        <div className="mt-8 grid place-items-center">
          <div className="flex max-w-[300px] flex-col items-center gap-3 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas-soft ring-1 ring-hairline">
              <MessageCircle className="h-5 w-5 text-ink-muted" strokeWidth={1.6} />
            </span>
            <div>
              <p className="text-[13.5px] font-semibold text-ink">Sub-agent chat coming online</p>
              <p className="mt-1 text-[12px] leading-[1.55] text-ink-muted">
                Per-node conversations and parallel branches activate in Phase 10. The visual contract
                lives here — interaction wires up later.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Disabled composer */}
      <div className="flex-shrink-0 border-t border-hairline bg-glass px-5 py-3">
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-hairline bg-canvas-soft/40 px-3 py-2 opacity-70">
          <Paperclip className="h-4 w-4 text-ink-muted" strokeWidth={1.8} />
          <input
            disabled
            placeholder="Phase 10 启用后可与 sub-agent 对话…"
            className="flex-1 bg-transparent text-[12.5px] placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="button"
            disabled
            className="grid h-8 w-8 place-items-center rounded-full bg-canvas-soft text-ink-muted ring-1 ring-hairline"
            aria-label="Send (disabled)"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Shared bits ─────────────── */

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}
