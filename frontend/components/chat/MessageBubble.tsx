'use client';
import type { ChatMessage } from '@/types/chat';
import ReactMarkdown from 'react-markdown';

const USER_SENDER_ID = 'orchestrai';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender.id === USER_SENDER_ID;
  const initials = message.sender.name.slice(0, 2).toUpperCase();

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3 py-2">
          <p className="text-sm">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
        style={{ backgroundColor: message.sender.color }}
        title={message.sender.name}
      >
        {initials}
      </div>
      <div className="max-w-[85%]">
        <span className="text-xs text-gray-500 ml-1 mb-1 block">{message.sender.name}</span>
        <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-3 py-2">
          <div className="text-sm text-gray-100 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
