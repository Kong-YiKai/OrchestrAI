'use client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MODELS = [
  { id: 'claude', label: 'Claude Opus', color: '#D97706', initials: 'C' },
  { id: 'gpt', label: 'GPT-4o', color: '#10B981', initials: 'G' },
  { id: 'gemini', label: 'Gemini Pro', color: '#3B82F6', initials: 'Ge' },
  { id: 'grok', label: 'Grok', color: '#8B5CF6', initials: 'Gr' },
];

interface AIModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function handleChange(onChange: (v: string) => void) {
  return (value: string | null) => {
    if (value) onChange(value);
  };
}

export function AIModelSelector({ value, onChange, disabled }: AIModelSelectorProps) {
  const current = MODELS.find((m) => m.id === value) ?? MODELS[0];

  return (
    <Select value={value} onValueChange={handleChange(onChange)} disabled={disabled}>
      <SelectTrigger className="h-7 text-xs bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500 w-[120px]">
        <div className="flex items-center gap-1.5">
          <span
            className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-white"
            style={{ backgroundColor: current.color, fontSize: '7px', fontWeight: 700 }}
          >
            {current.initials[0]}
          </span>
          <SelectValue>{current.label}</SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent className="bg-gray-900 border-gray-700">
        {MODELS.map((m) => (
          <SelectItem
            key={m.id}
            value={m.id}
            className="text-xs text-gray-300 hover:bg-gray-800 focus:bg-gray-800"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: m.color, fontSize: '8px' }}
              >
                {m.initials[0]}
              </span>
              {m.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
