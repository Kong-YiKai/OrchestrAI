import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import type { TMessage } from 'librechat-data-provider';
import { useOptionalMessagesOperations } from '~/Providers';
import { useAuthContext } from '~/hooks';

type ButtonProps = {
  onClick: () => void;
  title: string;
  icon: ReactNode;
  isActive: boolean;
  disabled: boolean;
};

/**
 * Deletes one user turn (the question and its replies). The server re-parents later turns,
 * and the local message cache is updated the same way, so the next request no longer carries
 * the removed exchange. Two clicks: the first arms the button, the second deletes.
 */
export default function DeleteTurn({
  message,
  conversationId,
  render,
}: {
  message: TMessage;
  conversationId: string;
  render: (props: ButtonProps) => ReactNode;
}) {
  const { token } = useAuthContext();
  const { getMessages, setMessages } = useOptionalMessagesOperations();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const remove = async () => {
    if (!armed) {
      setFailed(false);
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/orchestra/turns/${encodeURIComponent(conversationId)}/${encodeURIComponent(message.messageId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error('turn_delete_failed');
      const result: { removed: string[]; reparented: string[]; parentMessageId: string } =
        await response.json();
      const removed = new Set(result.removed);
      const moved = new Set(result.reparented);
      setMessages(
        (getMessages() ?? [])
          .filter((m) => !removed.has(m.messageId))
          .map((m) =>
            moved.has(m.messageId) ? { ...m, parentMessageId: result.parentMessageId } : m,
          ),
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  let title = '删除这一轮问答（不再计入上下文）';
  if (armed) title = '再次点击，确认删除这一轮问答';
  if (failed) title = '删除失败，请稍后重试';
  return render({
    onClick: remove,
    title,
    icon: <Trash2 size={17} className={armed || failed ? 'text-red-600' : undefined} />,
    isActive: armed,
    disabled: busy,
  });
}
