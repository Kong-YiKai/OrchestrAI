import { useLocalize } from '~/hooks';
import { createContext, useContext, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Files, Workflow } from 'lucide-react';

export type WorkbenchView = 'chat' | 'canvas' | 'results' | 'research' | 'context';
const views: WorkbenchView[] = ['chat', 'canvas', 'results', 'research', 'context'];
const WorkbenchContext = createContext<{
  view: WorkbenchView;
  setView: (view: WorkbenchView) => void;
} | null>(null);

/** URL-backed presentation state only. Conversations, files and research remain server owned. */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('view') as WorkbenchView;
  const view = views.includes(requested) ? requested : 'chat';
  const value = useMemo(
    () => ({
      view,
      setView: (next: WorkbenchView) => {
        setParams((previous) => {
          const updated = new URLSearchParams(previous);
          if (next === 'chat') updated.delete('view');
          else updated.set('view', next);
          return updated;
        });
      },
    }),
    [view, setParams],
  );
  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error('WorkbenchProvider is required');
  return value;
}

export function UnavailableView({ kind }: { kind: 'canvas' | 'results' }) {
  const localize = useLocalize();
  const { setView } = useWorkbench();
  const canvas = kind === 'canvas';
  const Icon = canvas ? Workflow : Files;
  return (
    <section className="orchestra-unavailable" aria-labelledby="unavailable-title">
      <div className="orchestra-empty-icon">
        <Icon size={30} strokeWidth={1.5} />
      </div>
      <p className="orchestra-eyebrow">{canvas ? '工作流画布' : '我的成果'}</p>
      <h2 id="unavailable-title">
        {canvas ? '让每一步工作，都有清晰的路径。' : '把完成的工作，留在这里。'}
      </h2>
      <p>
        {canvas
          ? '画布尚未接入真实工作流。当前可先通过对话明确目标、整理资料，或使用联网研究获取来源。'
          : '成果库尚未接入。当前回答与附件保存在对话中，联网研究保留独立的结果和来源记录。'}
      </p>
      <span className="orchestra-status">{localize('com_orchestra_not_connected')}</span>
      <button type="button" className="orchestra-primary" onClick={() => setView('chat')}>
        {localize('com_orchestra_return_chat')}
      </button>
    </section>
  );
}
