import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, X } from 'lucide-react';
import { TeamError, isEditable, useTeamApi } from './api';
import { stateOf } from './plan';
import type { Plan, Run } from './api';

type Message = { role: 'user' | 'assistant'; content: string; created_at: string };

/**
 * Talk a node's task through with its agent before it runs (or while it is paused). The
 * agent answers but does not touch files; the conversation becomes part of its brief.
 */
export default function NodeChat({ project, plan, run, taskId, onClose }: { project: string; plan: Plan; run?: Run; taskId: string; onClose: () => void }) {
  const call = useTeamApi();
  const client = useQueryClient();
  const key = ['orchestra-node-chat', project, taskId];
  const chat = useQuery<{ messages: Message[] }>(key, ({ signal }) => call(`/projects/${project}/chat?task=${taskId}`, 'GET', undefined, undefined, signal), { retry: false });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const task = plan.tasks.find((t) => t.id === taskId);
  const role = plan.roles.find((r) => r.id === task?.role);
  const open = isEditable(stateOf(run, taskId).status);
  const messages = chat.data?.messages ?? [];
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages.length, sending]);
  if (!task) return null;
  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const value = await call<{ messages: Message[] }>(`/projects/${project}/chat`, 'POST', { task: taskId, message: text });
      client.setQueryData(key, value);
      client.invalidateQueries(['orchestra-team', project]);
      setDraft('');
    } catch (failure) {
      setError(failure instanceof TeamError ? failure.message : '发送失败，请稍后重试。');
    } finally {
      setSending(false);
    }
  };
  return (
    <aside className="orchestra-team-log" aria-label={`和「${task.title}」讨论`}>
      <header>
        <div>
          <p className="orchestra-small-note">讨论 · {role?.name ?? task.role}</p>
          <h3>{task.title}</h3>
        </div>
        <button type="button" className="orchestra-icon-button" aria-label="关闭讨论" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="orchestra-team-log-body">
        <p className="orchestra-small-note">
          和负责这个任务的智能体聊聊要求、风格和取舍。它只回答、不改文件；开始工作时会把这段讨论当作你的补充要求。每条回复按模型用量计入团队花费。
        </p>
        <ol className="orchestra-team-chat">
          {messages.map((m, i) => (
            <li key={i} data-role={m.role}>
              <span>{m.role === 'user' ? '你' : role?.name ?? '智能体'}</span>
              <p>{m.content}</p>
            </li>
          ))}
          {sending && <li data-role="assistant"><span>{role?.name ?? '智能体'}</span><p>正在想…</p></li>}
        </ol>
        <div ref={end} />
      </div>
      {error && <p className="orchestra-team-warning orchestra-team-pad">{error}</p>}
      {open ? (
        <form className="orchestra-team-chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea
            rows={2}
            maxLength={4000}
            value={draft}
            placeholder="例如：大纲要突出孤独感，篇幅控制在一页。"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
          />
          <button type="submit" className="orchestra-primary" disabled={sending || !draft.trim()} aria-label="发送">
            <Send size={15} />
          </button>
        </form>
      ) : (
        <p className="orchestra-small-note orchestra-team-pad">这个节点已经开始或完成，讨论记录只读。</p>
      )}
    </aside>
  );
}
