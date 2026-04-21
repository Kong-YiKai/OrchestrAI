'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Send,
  Sparkles,
} from 'lucide-react';
import { useOrchestraStore } from '@/stores/orchestraStore';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

interface ChatThreadProps {
  contextOpen: boolean;
  onToggleContext: () => void;
  leftCollapsed: boolean;
  onToggleLeft: () => void;
  onSendMessage?: (content: string) => void;
}

export function ChatThread({
  contextOpen,
  onToggleContext,
  leftCollapsed,
  onToggleLeft,
}: ChatThreadProps) {
  const { messages, streamingBuffers, convState, sessionId } = useOrchestraStore();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingBuffers]);

  const send = () => {
    const text = draft.trim();
    if (!text || convState === 'generating') return;
    setDraft('');
    const socket = getSocket();
    socket.emit('chat_send', { content: text, session_id: sessionId });
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-canvas-soft">
      {/* subtle top tint */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[rgba(255,159,46,0.05)] to-transparent"
      />

      {/* Header */}
      <div className="relative flex h-[68px] flex-shrink-0 items-center justify-between gap-3 border-b border-hairline bg-glass px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleLeft}
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted transition-all hover:bg-canvas-soft hover:text-ink focus-ring"
            aria-label={leftCollapsed ? 'Expand projects panel' : 'Collapse projects panel'}
          >
            {leftCollapsed ? (
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            ) : (
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-ink">
                3D Weather App
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-success-700 ring-1 ring-success-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-success-500/60" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-success-500" />
                </span>
                Active
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              3 agents collaborating · auto-saving every 30s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleContext}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-all focus-ring',
              contextOpen
                ? 'bg-surface text-ink-soft ring-1 ring-hairline shadow-card'
                : 'bg-ink text-canvas hover:bg-[#2a241d]'
            )}
            aria-pressed={contextOpen}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} />
            {contextOpen ? 'Hide Context' : 'Show Context'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          {messages.length === 0 && <EmptyState />}
          {messages.map((m, idx) => {
            const displayContent = m.is_streaming
              ? (streamingBuffers[m.message_id] ?? '')
              : m.content;
            const initial = m.sender.name.charAt(0).toUpperCase();
            const isUser = m.sender.id === 'user';
            return (
              <motion.div
                key={m.message_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 32,
                  delay: Math.min(idx * 0.02, 0.12),
                }}
                className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}
              >
                <span
                  className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[13px] font-bold text-white shadow-card ring-2 ring-surface"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${m.sender.color || '#6B7280'}, ${
                      m.sender.color ? shade(m.sender.color, -18) : '#4B5563'
                    })`,
                  }}
                >
                  {initial}
                </span>
                <div className={cn('min-w-0 flex-1', isUser && 'flex flex-col items-end')}>
                  <div className={cn('flex items-baseline gap-2', isUser && 'flex-row-reverse')}>
                    <span className="text-[12.5px] font-semibold text-ink">{m.sender.name}</span>
                    <span className="text-[10.5px] text-ink-muted">
                      {new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'mt-1 max-w-[85%] rounded-2xl px-4 py-3 text-[13.5px] leading-[1.6]',
                      isUser
                        ? 'rounded-tr-sm bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-brand-glow'
                        : 'rounded-tl-sm border border-hairline bg-surface text-ink-soft shadow-card'
                    )}
                  >
                    {displayContent}
                    {m.is_streaming && (
                      <span className="ml-1 inline-block h-3.5 w-[3px] animate-pulse rounded-full bg-brand-500 align-middle" />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Composer with elevated dock */}
      <div className="relative flex-shrink-0 border-t border-hairline bg-glass px-6 py-4">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-6 left-0 right-0 h-6 bg-gradient-to-t from-canvas-soft to-transparent"
        />
        <div className="mx-auto flex max-w-[720px] items-end gap-2 rounded-2xl border border-hairline bg-surface px-3 py-2.5 shadow-elevated focus-within:border-brand-400 focus-within:shadow-[0_12px_32px_-16px_rgba(255,105,0,0.3)] focus-within:ring-2 focus-within:ring-brand-500/25">
          <button
            type="button"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-ring"
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            disabled={convState === 'generating'}
            placeholder={
              convState === 'generating' ? '正在生成工作流…' : 'Message the orchestra — mention agents with @…'
            }
            rows={1}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-[1.55] placeholder:text-ink-muted focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink focus-ring"
            aria-label="Suggest"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || convState === 'generating'}
            className="group relative grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-brand-glow transition-transform hover:scale-[1.05] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-card focus-ring"
            aria-label="Send"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.4),transparent_55%)]" />
            <Send className="relative h-4 w-4 translate-x-[1px]" strokeWidth={2} />
          </button>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-ink-muted">
          Enter 发送 · Shift + Enter 换行
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-20 flex max-w-[420px] flex-col items-center text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-300 text-brand-700 shadow-elevated ring-1 ring-white/50">
        <Sparkles className="h-7 w-7" strokeWidth={1.6} />
      </span>
      <h3 className="mt-5 text-[18px] font-semibold tracking-tight text-ink">
        Ready to compose?
      </h3>
      <p className="mt-2 text-[13px] leading-[1.6] text-ink-muted">
        描述你想构建的东西 —— Orchestrator 会澄清需求、你确认计划后，
        多位 AI agent 协同生成可执行工作流。
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {['3D 天气应用', 'E-commerce API', '多 AI 辩论'].map((hint) => (
          <span
            key={hint}
            className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft shadow-card"
          >
            {hint}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

// simple hex darkener for avatar gradient
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const factor = 1 + percent / 100;
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x * factor)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}
