import { useLocalize } from '~/hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, MessageSquare, Globe, Workflow, ArrowRight } from 'lucide-react';
import { useChatContext, useFileMapContext } from '~/Providers';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useWorkbench } from './Workbench';

/** Only message-linked files and this conversation's composer files belong in its context. */
export default function Context({ full = false }: { full?: boolean }) {
  const localize = useLocalize();
  const { conversationId } = useParams();
  const { conversation, files: draftFiles, isSubmitting } = useChatContext();
  const fileMap = useFileMapContext();
  const { setView } = useWorkbench();
  const current = conversation?.conversationId === conversationId;
  const {
    data: messages = [],
    isLoading,
    isError,
    refetch,
  } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: !!conversationId && conversationId !== 'new',
  });
  const linkedFiles = useMemo(() => {
    const selected = new Map<string, { id: string; name: string; draft: boolean }>();
    for (const message of messages)
      for (const file of message.files ?? []) {
        if (file.file_id)
          selected.set(file.file_id, {
            id: file.file_id,
            name: file.filename || fileMap?.[file.file_id]?.filename || '附件',
            draft: false,
          });
      }
    if (current)
      for (const file of draftFiles.values()) {
        if (!selected.has(file.file_id))
          selected.set(file.file_id, {
            id: file.file_id,
            name: file.filename || '待发送附件',
            draft: true,
          });
      }
    return [...selected.values()];
  }, [messages, draftFiles, current, fileMap]);
  const goal = messages.find((message) => message.isCreatedByUser && message.text?.trim())?.text;
  let status = '对话已保存';
  if (!conversationId || conversationId === 'new') status = '等待你的目标';
  else if (isLoading) status = '正在读取对话';
  if (current && isSubmitting) status = '正在回复';
  return (
    <aside
      className={`orchestra-context ${full ? 'orchestra-context-full' : ''}`}
      aria-labelledby={full ? 'context-full-title' : 'context-title'}
    >
      <div className="orchestra-context-heading">
        <h2 id={full ? 'context-full-title' : 'context-title'}>
          {localize('com_orchestra_task_context')}
        </h2>
        <span>{localize('com_orchestra_context_eyebrow')}</span>
      </div>
      <div className="orchestra-context-body">
        <h3>{localize('com_orchestra_context_intro')}</h3>
        <p className="orchestra-small-note">{localize('com_orchestra_context_hint')}</p>
        <section className="orchestra-context-card">
          <p className="orchestra-small-note">{localize('com_orchestra_current_goal')}</p>
          <p className="orchestra-goal">{goal || '从一句话开始'}</p>
          {goal && <p className="orchestra-small-note">{localize('com_orchestra_goal_origin')}</p>}
          {!goal && <p className="orchestra-small-note">{localize('com_orchestra_goal_hint')}</p>}
          {isError && (
            <p role="alert" className="orchestra-small-note">
              {localize('com_orchestra_context_error')}
              <button type="button" onClick={() => void refetch()}>
                {localize('com_orchestra_retry')}
              </button>
            </p>
          )}
        </section>
        <section className="orchestra-context-section">
          <h4>{localize('com_orchestra_work_status')}</h4>
          <div className="orchestra-context-state">
            <MessageSquare size={18} />
            <div>
              <p>{status}</p>
              <span>{localize('com_orchestra_workflow_status_hint')}</span>
            </div>
          </div>
          <button
            type="button"
            className="orchestra-context-link"
            onClick={() => setView('canvas')}
          >
            <Workflow size={16} />
            {localize('com_orchestra_view_canvas')}
            <ArrowRight size={15} />
          </button>
        </section>
        <section className="orchestra-context-section">
          <h4>
            {localize('com_orchestra_reference_files')}
            <span>{linkedFiles.length || ''}</span>
          </h4>
          {linkedFiles.map((file) => (
            <div key={file.id} className="orchestra-context-file">
              <FileText size={20} strokeWidth={1.5} />
              <div>
                <p title={file.name}>{file.name}</p>
                <span>{file.draft ? '待发送 · 请在输入区查看上传状态' : '已引用到对话'}</span>
              </div>
            </div>
          ))}
          {linkedFiles.length === 0 && (
            <div className="orchestra-context-empty">
              <FileText size={23} strokeWidth={1.5} />
              <p>{localize('com_orchestra_no_files')}</p>
              <span>{localize('com_orchestra_upload_hint')}</span>
            </div>
          )}
          <p className="orchestra-small-note orchestra-file-limit">
            {localize('com_orchestra_file_types')}
            <br />
            {localize('com_orchestra_file_limits')}
          </p>
        </section>
        <section className="orchestra-context-section">
          <h4>{localize('com_orchestra_public_sources')}</h4>
          <p className="orchestra-small-note">{localize('com_orchestra_research_context_hint')}</p>
          <button
            type="button"
            className="orchestra-context-link"
            onClick={() => setView('research')}
          >
            <Globe size={16} />
            {localize('com_orchestra_open_research')}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
    </aside>
  );
}
