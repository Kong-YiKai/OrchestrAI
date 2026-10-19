import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, ChevronRight, Cog, FileText, Globe, History, Users } from 'lucide-react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useChatContext, useFileMapContext } from '~/Providers';
import { useGetMessagesByConvoId, useUpdateConversationMutation } from '~/data-provider';
import { describeError, useTeamApi, yuan } from './teams/api';
import type { Project } from './teams/api';
import { useClarifiedTeam } from './clarify';
import { useWorkbench } from './Workbench';

const time = (at: string) =>
  new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Where a team created from this conversation stands, in one line. */
function teamState(team: Project): { text: string; live: boolean } {
  if (team.status === 'planning') return { text: '总指挥正在组建团队、画出工作流…', live: true };
  if (team.status === 'failed') return { text: describeError(team.error_code) || '组建失败，可在画布里重新生成。', live: false };
  const run = team.latest_run;
  const total = team.task_count ?? 0;
  if (!run) return { text: `工作流已生成 · ${total} 个节点，等你检查后运行`, live: false };
  if (run.active > 0) return { text: `运行中 · ${run.completed}/${total} 完成 · 已花 ${yuan(run.spent_cny)}`, live: true };
  if (run.failed > 0) return { text: `${run.failed} 个节点失败 · ${run.completed}/${total} 完成`, live: false };
  if (run.status === 'completed') return { text: `已完成 · 花费 ${yuan(run.spent_cny)}`, live: false };
  return { text: `已暂停 · ${run.completed}/${total} 完成`, live: false };
}

/**
 * The project panel beside a conversation: the requirements clarified so far, the agent team
 * they produced and how far it has got, the decision history, and the conversation's materials.
 */
export default function Context({ full = false }: { full?: boolean }) {
  const localize = useLocalize();
  const { conversationId } = useParams();
  const [, setParams] = useSearchParams();
  const { conversation, setConversation, files: draftFiles, isSubmitting } = useChatContext();
  const fileMap = useFileMapContext();
  const { setView } = useWorkbench();
  const { user } = useAuthContext();
  const call = useTeamApi();
  const [open, setOpen] = useState<'clarify' | 'history' | undefined>();
  const saved = !!conversationId && conversationId !== 'new';
  const current = conversation?.conversationId === conversationId;
  const {
    data: messages = [],
    isLoading,
    isError,
    refetch,
  } = useGetMessagesByConvoId(conversationId ?? '', { enabled: saved });
  const title = saved ? conversation?.title || localize('com_orchestra_new_conversation') : localize('com_orchestra_new_conversation');
  const rename = useUpdateConversationMutation(conversationId ?? '');
  // A conversation that became a project takes the project's name, so the task list reads well.
  const { clarification, failed, retry } = useClarifiedTeam(conversationId, messages, (name) => {
    const untitled = !conversation?.title || conversation.title === 'New Chat' || conversation.title === localize('com_ui_new_chat');
    if (!conversationId || !untitled) return;
    rename
      .mutateAsync({ conversationId, title: name })
      .then(() => setConversation((previous) => (previous?.conversationId === conversationId ? { ...previous, title: name } : previous)))
      .catch(() => undefined);
  });
  // Same cache entry as the canvas, so opening either view never fetches twice.
  const teams = useQuery<{ projects: Project[] }>(
    ['orchestra-teams', user?.id],
    ({ signal }) => call('/projects', 'GET', undefined, undefined, signal),
    {
      retry: false,
      refetchInterval: (data) =>
        data?.projects.some((p) => p.conversation_id === conversationId && teamState(p).live) ? 4000 : false,
    },
  );
  const linked = saved ? teams.data?.projects.find((p) => p.conversation_id === conversationId) : undefined;
  const latestTeam = teams.data?.projects[0];
  const openTeam = (id?: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('view', 'canvas');
      if (id) next.set('team', id);
      return next;
    });

  const files = useMemo(() => {
    const selected = new Map<string, { id: string; name: string; draft: boolean }>();
    for (const message of messages)
      for (const file of message.files ?? [])
        if (file.file_id)
          selected.set(file.file_id, {
            id: file.file_id,
            name: file.filename || fileMap?.[file.file_id]?.filename || '',
            draft: false,
          });
    if (current)
      for (const file of draftFiles.values())
        if (!selected.has(file.file_id))
          selected.set(file.file_id, { id: file.file_id, name: file.filename || '', draft: true });
    return [...selected.values()];
  }, [messages, draftFiles, current, fileMap]);

  let status = localize('com_orchestra_status_saved');
  if (!saved) status = localize('com_orchestra_status_waiting');
  else if (isLoading) status = localize('com_orchestra_status_loading');
  if (current && isSubmitting) status = localize('com_orchestra_status_replying');

  const answered = clarification.answers.filter((a) => a.answer);
  let clarifyNote = '说出想做的东西，助手会一步步问清需求';
  if (clarification.pending) clarifyNote = `${clarification.pending} 个问题等你决定`;
  else if (clarification.confirmed) clarifyNote = `需求已确认 · ${answered.length} 项选择`;
  else if (answered.length) clarifyNote = `已回答 ${answered.length} 个问题`;

  const state = linked ? teamState(linked) : undefined;
  let buildNote = '确认需求后自动组建智能体团队';
  if (failed) buildNote = `组建失败：${failed}`;
  else if (state) buildNote = state.text;
  else if (clarification.confirmed) buildNote = '正在提交需求，组建团队…';

  const history = [
    ...answered.map((a) => ({ key: a.key, at: a.at, text: `${a.header ?? a.question} → ${a.answer}` })),
    ...(clarification.confirmed ? [{ key: 'confirm', at: clarification.confirmed.at, text: '确认需求，开始组建团队' }] : []),
    ...(linked ? [{ key: 'team', at: linked.created_at, text: `团队「${linked.workspace_name}」已创建` }] : []),
    ...(linked?.latest_run ? [{ key: 'run', at: linked.latest_run.updated_at, text: `团队最近一次运行：${state?.text ?? ''}` }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <aside
      className={`orchestra-context ${full ? 'orchestra-context-full' : ''}`}
      aria-labelledby={full ? 'context-full-title' : 'context-title'}
    >
      <div className="orchestra-context-heading">
        <h2 id={full ? 'context-full-title' : 'context-title'}>项目概览</h2>
      </div>
      <div className="orchestra-context-body">
        <section className="orchestra-context-card" aria-label={localize('com_orchestra_conversation')}>
          <p className="orchestra-context-label">{localize('com_orchestra_conversation')}</p>
          <p className="orchestra-context-title" title={title}>{title}</p>
          <p className="orchestra-context-meta">
            <span className={`orchestra-context-dot ${current && isSubmitting ? 'is-busy' : ''}`} aria-hidden="true" />
            {saved && !isLoading && `${localize('com_orchestra_message_count', { count: messages.length })} · `}
            {status}
          </p>
          {isError && (
            <p role="alert" className="orchestra-context-meta">
              {localize('com_orchestra_context_error')}
              <button type="button" className="orchestra-context-retry" onClick={() => void refetch()}>
                {localize('com_orchestra_retry')}
              </button>
            </p>
          )}
        </section>

        <div className="orchestra-project-cards">
          <ProjectCard
            tone="rose"
            icon={<Boxes size={18} />}
            title="需求澄清"
            note={clarifyNote}
            badge={clarification.pending ? String(clarification.pending) : undefined}
            expanded={open === 'clarify'}
            onClick={() => setOpen(open === 'clarify' ? undefined : 'clarify')}
          >
            {clarification.answers.length === 0 ? (
              <p className="orchestra-context-empty">例如「我要做一个天气预报网页」：助手会用选项卡片问清风格、功能和预算，确认后自动生成工作流。</p>
            ) : (
              <ol className="orchestra-project-qa">
                {clarification.answers.map((a) => (
                  <li key={a.key}>
                    <span>{a.header ?? a.question}</span>
                    <strong data-pending={!a.answer || undefined}>{a.answer ?? '待回答'}</strong>
                  </li>
                ))}
              </ol>
            )}
            {clarification.confirmed && <p className="orchestra-project-summary">{clarification.confirmed.summary}</p>}
          </ProjectCard>
          <ProjectCard
            tone="amber"
            icon={<Cog size={18} />}
            title="构建进度"
            note={buildNote}
            badge={state?.live ? 'Live' : undefined}
            live={state?.live}
            onClick={failed ? retry : () => openTeam(linked?.id)}
            action={failed ? '重试' : linked ? '打开工作流' : undefined}
          />
          <ProjectCard
            tone="slate"
            icon={<History size={18} />}
            title="历史"
            note={history.length ? `${history.length} 条决定与进展` : '这里会记下每一次选择和团队进展'}
            expanded={open === 'history'}
            onClick={() => setOpen(open === 'history' ? undefined : 'history')}
          >
            {history.length === 0 ? (
              <p className="orchestra-context-empty">还没有记录。</p>
            ) : (
              <ol className="orchestra-project-history">
                {history.map((h) => (
                  <li key={h.key}>
                    <time>{time(h.at)}</time>
                    <p>{h.text}</p>
                  </li>
                ))}
              </ol>
            )}
          </ProjectCard>
        </div>

        <section className="orchestra-context-section">
          <h3>
            {localize('com_orchestra_reference_files')}
            {files.length > 0 && <span>{files.length}</span>}
          </h3>
          {files.map((file) => (
            <div key={file.id} className="orchestra-context-file">
              <FileText size={16} strokeWidth={1.6} aria-hidden="true" />
              <p title={file.name}>{file.name || localize('com_orchestra_file_untitled')}</p>
              <span>{localize(file.draft ? 'com_orchestra_file_draft' : 'com_orchestra_file_sent')}</span>
            </div>
          ))}
          {files.length === 0 && <p className="orchestra-context-empty">{localize('com_orchestra_no_files')}</p>}
          <p className="orchestra-context-note">{localize('com_orchestra_file_limits')}</p>
        </section>

        <section className="orchestra-context-section">
          <h3>{localize('com_orchestra_workspaces')}</h3>
          <WorkspaceLink
            icon={<Users size={17} />}
            title={localize('com_orchestra_teams_title')}
            detail={
              latestTeam
                ? localize('com_orchestra_teams_latest', { name: latestTeam.workspace_name || latestTeam.goal })
                : localize('com_orchestra_teams_empty')
            }
            onClick={() => setView('canvas')}
          />
          <WorkspaceLink
            icon={<Globe size={17} />}
            title={localize('com_orchestra_research_title')}
            detail={localize('com_orchestra_research_context_hint')}
            onClick={() => setView('research')}
          />
        </section>
      </div>
    </aside>
  );
}

function ProjectCard(props: {
  tone: 'rose' | 'amber' | 'slate';
  icon: ReactNode;
  title: string;
  note: string;
  badge?: string;
  live?: boolean;
  expanded?: boolean;
  action?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="orchestra-project-card" data-tone={props.tone} data-live={props.live || undefined}>
      <button type="button" aria-expanded={props.children ? !!props.expanded : undefined} onClick={props.onClick}>
        <span className="orchestra-project-icon" aria-hidden="true">{props.icon}</span>
        <span className="orchestra-project-text">
          <strong>{props.title}</strong>
          <span>{props.note}</span>
        </span>
        {props.badge && <span className="orchestra-project-badge">{props.badge}</span>}
        {props.action ? <span className="orchestra-project-action">{props.action}</span> : <ChevronRight size={16} aria-hidden="true" />}
      </button>
      {props.expanded && props.children && <div className="orchestra-project-detail">{props.children}</div>}
    </div>
  );
}

function WorkspaceLink(props: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="orchestra-context-link" onClick={props.onClick}>
      <span className="orchestra-context-link-icon" aria-hidden="true">{props.icon}</span>
      <span className="orchestra-context-link-text">
        <strong>{props.title}</strong>
        <span title={props.detail}>{props.detail}</span>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}
