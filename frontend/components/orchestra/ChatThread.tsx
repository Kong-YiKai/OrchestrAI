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

type Message = {
  id: string;
  role: 'user' | 'assistant';
  author: string;
  avatar: string;
  tone?: 'brand' | 'violet' | 'sky' | 'rose';
  body: string;
  ts: string;
};

const SEED: Message[] = [
  {
    id: 'm1',
    role: 'user',
    author: 'Vita',
    avatar: 'V',
    body:
      '@GPT-5, Claude — I have drafted a complete workflow for the 3D Weather App but I want to set up parallel tasks with 3D visuals.',
    ts: '10:42',
  },
  {
    id: 'm2',
    role: 'assistant',
    author: 'GPT-5',
    avatar: 'G',
    tone: 'violet',
    body:
      'Create a weather forecast app with a modern UI with 3D statements to view and interact with.',
    ts: '10:43',
  },
  {
    id: 'm3',
    role: 'assistant',
    author: 'Claude 4.5',
    avatar: 'C',
    tone: 'brand',
    body:
      'Understood. I will kick off the scaffold — Three.js base scene, lazy-loaded cloud meshes, and a real-time barometric graph. GPT can review the copy deck while I hand off the API layer to the tools team.',
    ts: '10:44',
  },
];

const TONE: Record<NonNullable<Message['tone']>, string> = {
  brand: 'bg-brand-500',
  violet: 'bg-[#7c3aed]',
  sky: 'bg-[#0ea5e9]',
  rose: 'bg-danger-500',
};

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
  onSendMessage,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', author: 'You', avatar: 'Y', body: text, ts: 'now' },
    ]);
    setDraft('');
    onSendMessage?.(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full flex-col bg-canvas-soft">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas px-6 py-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleLeft}
            className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
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
              <h2 className="text-[18px] font-semibold tracking-tight text-ink">
                Project: 3D Weather App
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                Active
              </span>
            </div>
            <p className="mt-1 text-[12px] text-ink-muted">
              3 agents collaborating · auto-saving every 30s
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleContext}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-[12px] font-medium text-ink-soft ring-1 ring-hairline transition-colors hover:bg-canvas-soft"
            aria-pressed={contextOpen}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={2} />
            {contextOpen ? 'Hide Context' : 'Show Context'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-5">
          {messages.map((m, idx) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(idx * 0.02, 0.15) }}
              className="flex items-start gap-3"
            >
              <span
                className={`mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[13px] font-semibold text-white ${
                  m.tone ? TONE[m.tone] : 'bg-ink-soft'
                }`}
              >
                {m.avatar}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-ink">{m.author}</span>
                  <span className="text-[11px] text-ink-muted">{m.ts}</span>
                </div>
                <div className="mt-1 rounded-[14px] border border-hairline bg-surface px-4 py-3 text-[13.5px] leading-[1.55] text-ink-soft shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                  {m.body}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-hairline bg-canvas px-6 py-4">
        <div className="mx-auto flex max-w-[720px] items-end gap-2 rounded-[16px] border border-hairline bg-surface px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)] focus-within:ring-2 focus-within:ring-brand-500/40">
          <button
            type="button"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
            aria-label="Attach"
          >
            <Paperclip className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message the orchestra — mention agents with @…"
            rows={1}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-[1.5] placeholder:text-ink-muted focus:outline-none"
          />
          <button
            type="button"
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-canvas-soft hover:text-ink"
            aria-label="Suggest"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim()}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-gradient-to-b from-brand-400 to-brand-500 text-white shadow-[0_1px_0_rgba(255,255,255,0.3)_inset] transition-transform active:scale-[0.95] disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
