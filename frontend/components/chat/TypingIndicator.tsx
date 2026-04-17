'use client';

const AI_COLORS: Record<string, string> = {
  claude: '#D97706',
  gpt: '#10B981',
  gemini: '#3B82F6',
  grok: '#8B5CF6',
};

const AI_INITIALS: Record<string, string> = {
  claude: 'C',
  gpt: 'G',
  gemini: 'Ge',
  grok: 'Gr',
};

interface TypingIndicatorProps {
  aiIds: string[];
}

export function TypingIndicator({ aiIds }: TypingIndicatorProps) {
  if (aiIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {aiIds.slice(0, 2).map((id) => (
          <div
            key={id}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: AI_COLORS[id] || '#6b7280' }}
          >
            {AI_INITIALS[id] || id[0].toUpperCase()}
          </div>
        ))}
      </div>
      <div className="bg-gray-800 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
