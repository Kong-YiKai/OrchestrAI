import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, Globe, Users } from 'lucide-react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useChatContext, useFileMapContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useTeamApi } from './teams/api';
import type { Project } from './teams/api';
import { useWorkbench } from './Workbench';

/** One glanceable column: this conversation, its materials, and the two other workspaces. */
export default function Context({ full = false }: { full?: boolean }) {
  const localize = useLocalize();
  const { conversationId } = useParams();
  const { conversation, files: draftFiles, isSubmitting } = useChatContext();
  const fileMap = useFileMapContext();
  const { setView } = useWorkbench();
  const { user } = useAuthContext();
  const call = useTeamApi();
  const saved = !!conversationId && conversationId !== 'new';
  const current = conversation?.conversationId === conversationId;
  const {
    data: messages = [],
    isLoading,
    isError,
    refetch,
  } = useGetMessagesByConvoId(conversationId ?? '', { enabled: saved });
  // Same cache entry as the canvas, so opening either view never fetches twice.
  const teams = useQuery<{ projects: Project[] }>(
    ['orchestra-teams', user?.id],
    ({ signal }) => call('/projects', 'GET', undefined, undefined, signal),
    { retry: false },
  );
  const latestTeam = teams.data?.projects[0];

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
  const title = saved ? conversation?.title || localize('com_orchestra_new_conversation') : localize('com_orchestra_new_conversation');

  return (
    <aside
      className={`orchestra-context ${full ? 'orchestra-context-full' : ''}`}
      aria-labelledby={full ? 'context-full-title' : 'context-title'}
    >
      <div className="orchestra-context-heading">
        <h2 id={full ? 'context-full-title' : 'context-title'}>{localize('com_orchestra_task_context')}</h2>
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
