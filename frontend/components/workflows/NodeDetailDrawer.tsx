'use client';

import { useState, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  Code2,
  FileText,
  MessageSquare,
  Search,
  Send,
  Shield,
  Terminal,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type DrawerTab = 'config' | 'chat';

export interface NodeDetail {
  id: string;
  title: string;
  modelLabel: string; // e.g. "GPT 5.0"
}

interface Props {
  node: NodeDetail | null;
  onClose: () => void;
}

export function NodeDetailDrawer({ node, onClose }: Props) {
  const [tab, setTab] = useState<DrawerTab>('config');

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          key={node.id}
          initial={{ x: '100%', opacity: 0.4 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="absolute right-0 top-0 z-20 flex h-full w-[440px] flex-col border-l border-hairline bg-glass-surface shadow-overlay"
        >
          {/* Header */}
          <div className="border-b border-hairline px-5 pb-0 pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[16px] font-semibold tracking-tight text-ink">{node.title}</h2>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-500/20">
                  {node.modelLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4 flex gap-1">
              <TabButton
                active={tab === 'config'}
                onClick={() => setTab('config')}
                label="Configurations & Permissions"
                icon={<Shield className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
              <TabButton
                active={tab === 'chat'}
                onClick={() => setTab('chat')}
                label="Node Sub-Agent Chat"
                icon={<MessageSquare className="h-3.5 w-3.5" strokeWidth={1.8} />}
              />
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {tab === 'config' ? <ConfigBody /> : <SubAgentChatBody />}
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
        active ? 'bg-surface text-ink ring-1 ring-hairline' : 'text-ink-muted hover:text-ink-soft'
      )}
    >
      {icon}
      {label}
      {active && (
        <motion.span
          layoutId="wf-drawer-tab"
          className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500"
        />
      )}
    </button>
  );
}

/* ───────────────── Config & Permissions ───────────────── */

function ConfigBody() {
  return (
    <div className="flex flex-col gap-6 p-5">
      <Section title="Installed Plugins" tone="brand">
        <div className="grid grid-cols-2 gap-2">
          <PluginPill icon={<FileText className="h-3.5 w-3.5" />} label="File System" />
          <PluginPill icon={<Search className="h-3.5 w-3.5" />} label="Web Search" />
          <PluginPill icon={<Terminal className="h-3.5 w-3.5" />} label="Linux" />
        </div>
      </Section>

      <Section title="Action Skills" tone="success">
        <div className="flex flex-col gap-2">
          <SkillRow icon={<Terminal className="h-3.5 w-3.5" />} label="Bash Executor" enabled />
          <SkillRow icon={<Code2 className="h-3.5 w-3.5" />} label="Code Analysis" enabled />
        </div>
      </Section>

      <Section title="Required Permissions" tone="warning">
        <div className="rounded-[12px] border border-hairline bg-surface p-3.5">
          <p className="text-[12px] font-medium text-ink">Execution Authority</p>
          <p className="mt-1 text-[11px] leading-[1.5] text-ink-muted">
            Allow this node to execute dependencies, spawn sub-agents, and write to the shared file repository.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Authorised by…"
              className="h-9 flex-1 rounded-[10px] border border-hairline bg-canvas px-3 text-[12.5px] placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-brand-500 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
              Grant
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'brand' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const dot: Record<typeof tone, string> = {
    brand: 'bg-brand-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
  } as const;
  return (
    <div>
      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} />
        {title}
      </p>
      {children}
    </div>
  );
}

function PluginPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-hairline bg-surface px-3 py-2 text-[12px] font-medium text-ink">
      <span className="inline-flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-canvas-soft text-ink-soft">
          {icon}
        </span>
        {label}
      </span>
      <span className="grid h-4 w-4 place-items-center rounded-full bg-success-500 text-white">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    </div>
  );
}

function SkillRow({
  icon,
  label,
  enabled,
}: {
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-hairline bg-surface px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-canvas-soft text-ink-soft">
          {icon}
        </span>
        {label}
      </span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors',
          enabled ? 'bg-success-500' : 'bg-hairline'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            enabled ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </div>
  );
}

/* ───────────────── Sub-agent chat ───────────────── */

type SubMsg = { id: string; role: 'user' | 'agent'; body: string };

function SubAgentChatBody() {
  const [messages, setMessages] = useState<SubMsg[]>([
    {
      id: 'sm1',
      role: 'agent',
      body:
        'I will use the installed plugins for this workflow step. I spawn sub-agents independently from the main Orchestra session. Ask me anything to narrow the scope.',
    },
  ]);
  const [draft, setDraft] = useState('');

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((p) => [...p, { id: crypto.randomUUID(), role: 'user', body: text }]);
    setDraft('');
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb inside sub-chat */}
      <div className="flex items-center gap-1 border-b border-hairline px-5 py-3 text-[11.5px] text-ink-muted">
        <span className="font-medium text-ink">Main Thread</span>
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
        <span>Sub-Agent · Requirements</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-5">
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[13px] leading-[1.5]',
                  m.role === 'user'
                    ? 'rounded-tr-[4px] bg-brand-500 text-white'
                    : 'rounded-tl-[4px] border border-hairline bg-surface text-ink-soft'
                )}
              >
                {m.body}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-hairline p-4">
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1 text-[11.5px] font-semibold text-warning-500"
        >
          ↓ View Parallel Iteration
        </button>
        <div className="flex items-end gap-2 rounded-[14px] border border-hairline bg-surface px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500/40">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message this sub-agent…"
            rows={1}
            className="min-h-[28px] flex-1 resize-none bg-transparent py-1 text-[13px] placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-white transition-transform active:scale-95 disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
