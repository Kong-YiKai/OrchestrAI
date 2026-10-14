import { useLocalize } from '~/hooks';
import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Menu, Pencil, Check, X, Globe } from 'lucide-react';
import { useChatContext } from '~/Providers';
import { useUpdateConversationMutation, useGetStartupConfig } from '~/data-provider';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import HeaderMenu from '~/components/Chat/Menus/HeaderMenu';
import SubagentThreadLink from '~/components/Chat/SubagentThreadLink';
import { useWorkbench } from './Workbench';

export default function Header({
  parentConversationId,
  readOnly = false,
}: {
  parentConversationId?: string;
  readOnly?: boolean;
}) {
  const localize = useLocalize();
  const { conversationId } = useParams();
  const { conversation, isSubmitting, setConversation } = useChatContext();
  const { view, setView } = useWorkbench();
  const { setSidebarOpen } = useSidebarToggle();
  const rename = useUpdateConversationMutation(conversationId ?? '');
  const { data: startupConfig } = useGetStartupConfig();
  const [editing, setEditing] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [error, setError] = useState('');
  const renameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [editing]);
  const current = conversation?.conversationId === conversationId ? conversation : null;
  const isNew = !conversationId || conversationId === 'new';
  const title = isNew ? '新任务' : current?.title || '加载任务…';
  let status = '对话已保存';
  if (isNew) status = '草稿';
  if (isSubmitting && current) status = '正在回复';
  if (!current && !isNew) status = '加载中';
  if (readOnly) status = '只读记录';
  return (
    <header className="orchestra-task-header">
      <div className="orchestra-task-title">
        <button
          id="open-sidebar-button"
          type="button"
          className="orchestra-icon-button orchestra-mobile-menu"
          aria-label="打开任务导航"
          aria-controls="chat-history-nav"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          {editing ? (
            <form
              className="orchestra-rename"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!titleInput.trim() || !current || !conversationId) return;
                setError('');
                try {
                  const updated = await rename.mutateAsync({
                    conversationId,
                    title: titleInput.trim(),
                  });
                  setConversation((previous) =>
                    previous && previous.conversationId === conversationId
                      ? { ...previous, title: updated.title }
                      : previous,
                  );
                  setEditing(false);
                } catch {
                  setError('名称保存失败，请重试。');
                }
              }}
            >
              <input
                ref={renameInput}
                aria-label="任务名称"
                value={titleInput}
                maxLength={100}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <button
                type="submit"
                className="orchestra-icon-button"
                aria-label="保存任务名称"
                disabled={rename.isLoading}
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                className="orchestra-icon-button"
                aria-label="取消重命名"
                onClick={() => setEditing(false)}
              >
                <X size={18} />
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h1 title={title}>{title}</h1>
              {!isNew && current && !readOnly && (
                <button
                  className="orchestra-icon-button orchestra-rename-button"
                  type="button"
                  aria-label="重命名任务"
                  onClick={() => {
                    setTitleInput(title);
                    setEditing(true);
                    setError('');
                  }}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          <p>{localize('com_orchestra_task_header_hint')}</p>
          {error && (
            <p role="alert" className="text-text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="orchestra-header-actions">
        <span role="status" className="orchestra-status">
          {status}
        </span>
        <button
          type="button"
          className="orchestra-icon-button"
          aria-label="打开联网研究"
          aria-pressed={view === 'research'}
          onClick={() => setView('research')}
        >
          <Globe size={18} />
        </button>
        {!readOnly && <HeaderMenu startupConfig={startupConfig} />}
      </div>
      <nav className="orchestra-view-tabs" aria-label="工作台视图">
        {(
          [
            ['chat', '对话'],
            ['canvas', '画布'],
            ['context', '上下文'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={view === key ? 'page' : undefined}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {parentConversationId && <SubagentThreadLink threadId={parentConversationId} />}
    </header>
  );
}
