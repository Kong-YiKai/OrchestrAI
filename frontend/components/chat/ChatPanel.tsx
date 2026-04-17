'use client';
import { useRef, useEffect, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { ScrollArea } from '@/components/ui/scroll-area';

const AI_MEMBERS = [
  { id: 'claude', name: 'Claude', color: '#D97706', initials: 'C' },
  { id: 'gpt', name: 'GPT-4o', color: '#10B981', initials: 'G' },
  { id: 'gemini', name: 'Gemini', color: '#3B82F6', initials: 'Ge' },
  { id: 'grok', name: 'Grok', color: '#8B5CF6', initials: 'Gr' },
];

interface ChatPanelProps {
  onSendMessage: (content: string) => void;
  sessionId: string;
}

export function ChatPanel({ onSendMessage, sessionId }: ChatPanelProps) {
  const { messages, streamingMessages, typingAIs } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessages]);

  // Collect all streaming message entries to render
  const streamingEntries = Object.entries(streamingMessages);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex -space-x-2">
          {AI_MEMBERS.map((ai) => (
            <div
              key={ai.id}
              className="w-8 h-8 rounded-full border-2 border-gray-950 flex items-center justify-center text-xs font-bold text-white relative"
              style={{ backgroundColor: ai.color }}
              title={ai.name}
            >
              {ai.initials}
              {typingAIs.includes(ai.id) && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-gray-950 animate-pulse" />
              )}
            </div>
          ))}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">OrchestrAI Chat</p>
          <p className="text-xs text-gray-500">4 AI members active</p>
        </div>
        <div className="ml-auto">
          <span className="text-xs text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
            Live
          </span>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length === 0 && streamingEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="text-4xl mb-4">🎼</div>
            <p className="text-gray-400 text-sm font-medium">Welcome to OrchestrAI</p>
            <p className="text-gray-600 text-xs mt-1">
              Describe any idea — we'll build a workflow for it.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.message_id} message={msg} />
          ))}

          {/* Streaming messages */}
          {streamingEntries.map(([messageId, text]) => (
            <div key={messageId} className="flex items-start gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: '#D97706' }}
              >
                C
              </div>
              <div className="max-w-[85%] bg-gray-800 rounded-2xl rounded-tl-sm px-3 py-2">
                <p className="text-sm text-gray-100 whitespace-pre-wrap">{text}</p>
                <span className="inline-block w-1 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
              </div>
            </div>
          ))}

          {typingAIs.length > 0 && streamingEntries.length === 0 && (
            <TypingIndicator aiIds={typingAIs} />
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-800 p-3">
        <ChatInput onSend={onSendMessage} />
      </div>
    </div>
  );
}
