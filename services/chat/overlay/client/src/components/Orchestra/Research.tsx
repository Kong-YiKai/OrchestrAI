import { useLocalize } from '~/hooks';
import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChatFormContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { Globe, ArrowRight, ExternalLink, Search, ChevronDown, Trash2, Square } from 'lucide-react';
import { useAuthContext } from '~/hooks';
import { useWorkbench } from './Workbench';

type Source = {
  id: string;
  title: string;
  url: string;
  state: string;
  evidence: string;
  fetched_at: string;
};
type Claim = { text: string; source_id: string; quote: string };
type Query = {
  id: string;
  query: string;
  status: string;
  phase: string;
  error?: string;
  result?: { sources?: Source[]; claims?: Claim[]; elapsed_ms?: number };
};
const active = (query?: Query) => !!query && ['queued', 'running'].includes(query.status);
const phases: Record<string, string> = {
  queued: '等待开始',
  searching: '检索公开来源',
  reading: '读取网页',
  ranking: '筛选相关证据',
  answering: '整理有出处的回答',
  finished: '研究结束',
  cancelled: '已取消',
  interrupted: '任务中断',
};
const states: Record<string, string> = {
  completed: '已完成',
  partial: '部分完成',
  failed: '失败',
  cancelled: '已取消',
  queued: '排队中',
  running: '研究中',
};

/** Uses the existing research API. Importing a result only stages a user-editable chat draft. */
export default function Research({ canImport = true }: { canImport?: boolean }) {
  const localize = useLocalize();
  const { token, user } = useAuthContext();
  const { setView } = useWorkbench();
  const methods = useChatFormContext();
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const operation = useRef<{ query: string; id: string }>();
  const call = useCallback(
    async (path: string, method = 'GET', body?: unknown, id?: string, signal?: AbortSignal) => {
      const response = await fetch(`/api/research${path}`, {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(id ? { 'Idempotency-Key': id } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const errors: Record<number, string> = {
          401: '登录已过期，请重新登录。',
          429: '当前任务或调用额度已满，请稍后再试。',
        };
        throw new Error(errors[response.status] || '研究服务暂时不可用，请稍后重试。');
      }
      return response.json();
    },
    [token],
  );
  const history = useQuery<{ queries: Query[] }>(
    ['orchestra-research', user?.id],
    ({ signal }) => call('/queries', 'GET', undefined, undefined, signal),
    {
      refetchInterval: (data) => (data?.queries.some(active) ? 1500 : false),
      retry: false,
    },
  );
  const queries = history.data?.queries ?? [];
  const current = queries.find((q) => q.id === selected) ?? queries[0];
  const refresh = () => history.refetch();
  const mutate = async (path: string, method: string) => {
    setActing(true);
    setError('');
    try {
      await call(path, method, method === 'POST' ? {} : undefined);
      setConfirmDelete(false);
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setActing(false);
    }
  };
  const importResult = () => {
    if (!current?.result?.claims?.length) return;
    const sources = current.result.sources ?? [];
    const text = [
      `以下是联网研究结果（${states[current.status] ?? current.status}），请结合这些证据继续讨论：`,
      current.query,
      ...current.result.claims.map((claim) => `${claim.text}\n引用：${claim.quote}`),
      '来源：',
      ...sources
        .filter((source) => source.state === 'read')
        .map((source) => `${source.title} ${source.url}`),
    ].join('\n\n');
    const draft = methods.getValues('text') ?? '';
    methods.setValue('text', [draft, text].filter(Boolean).join('\n\n'), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setView('chat');
    window.requestAnimationFrame(() => document.getElementById(mainTextareaId)?.focus());
  };
  return (
    <section className="orchestra-research" aria-labelledby="research-title">
      <div className="orchestra-research-intro">
        <p className="orchestra-eyebrow">{localize('com_orchestra_research_eyebrow')}</p>
        <h2 id="research-title">{localize('com_orchestra_research_title')}</h2>
        <p>{localize('com_orchestra_research_intro')}</p>
      </div>
      <form
        className="orchestra-research-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting || queries.some(active) || !input.trim()) return;
          setSubmitting(true);
          setError('');
          const query = input.trim();
          if (!operation.current || operation.current.query !== query)
            operation.current = { query, id: crypto.randomUUID() };
          try {
            const created = await call('/queries', 'POST', { query }, operation.current.id);
            setSelected(created.id);
            operation.current = undefined;
            await refresh();
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <label htmlFor="research-query">{localize('com_orchestra_research_prompt')}</label>
        <textarea
          id="research-query"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          required
          rows={3}
          placeholder="输入问题，或粘贴一条公开网页链接…"
        />
        <div className="orchestra-research-form-actions">
          <span>{localize('com_orchestra_research_failure_hint')}</span>
          <button
            type="submit"
            className="orchestra-primary"
            disabled={submitting || queries.some(active)}
          >
            <Search size={16} />
            {submitting ? '正在提交…' : '开始研究'}
          </button>
        </div>
      </form>
      <p className="orchestra-small-note">{localize('com_orchestra_research_draft_hint')}</p>
      {(error || history.isError) && (
        <div role="alert" className="orchestra-error">
          {error || '研究记录读取失败。'}
          {history.isError && (
            <button type="button" onClick={() => void refresh()}>
              {localize('com_orchestra_reload')}
            </button>
          )}
        </div>
      )}
      {history.isLoading && (
        <p role="status" className="orchestra-small-note">
          {localize('com_orchestra_loading_research')}
        </p>
      )}
      <div className="orchestra-research-history" aria-label="个人研究记录">
        {queries.map((query) => (
          <button
            key={query.id}
            type="button"
            onClick={() => {
              setSelected(query.id);
              setConfirmDelete(false);
            }}
            aria-pressed={query.id === current?.id}
            title={query.query}
          >
            {query.query}
          </button>
        ))}
      </div>
      {!history.isLoading && !history.isError && queries.length === 0 && (
        <div className="orchestra-research-empty">
          <Globe size={30} strokeWidth={1.5} />
          <h3>{localize('com_orchestra_research_empty_title')}</h3>
          <p>{localize('com_orchestra_research_empty_hint')}</p>
        </div>
      )}
      {current && (
        <section className="orchestra-research-result" aria-label="研究结果">
          <header>
            <div>
              <p className="orchestra-eyebrow">{localize('com_orchestra_research_record')}</p>
              <h3>{current.query}</h3>
            </div>
            <span role="status" aria-live="polite" className="orchestra-status">
              {states[current.status] ?? current.status}
            </span>
          </header>
          {active(current) && (
            <div className="orchestra-research-progress">
              <p role="status">{phases[current.phase] ?? '研究正在进行'}</p>
              <button
                type="button"
                className="orchestra-secondary"
                disabled={acting}
                onClick={() => void mutate(`/queries/${current.id}/cancel`, 'POST')}
              >
                <Square size={13} />
                {localize('com_orchestra_cancel_research')}
              </button>
            </div>
          )}
          {['partial', 'failed'].includes(current.status) && (
            <p className="orchestra-result-notice">
              {current.result?.claims?.length
                ? '部分完成：以下结论由已取得的证据支持，仍有来源未能读取。'
                : '没有取得足够证据，暂时无法给出有依据的结论。'}
            </p>
          )}
          {current.status === 'cancelled' && (
            <p className="orchestra-result-notice">
              {localize('com_orchestra_research_cancel_hint')}
            </p>
          )}
          <div className="orchestra-research-claims">
            {current.result?.claims?.map((claim, index) => {
              const source = current.result?.sources?.find((s) => s.id === claim.source_id);
              return (
                <article key={index}>
                  <p>
                    {claim.text}{' '}
                    {source && (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {'['}
                        {claim.source_id}
                        {']'}
                      </a>
                    )}
                  </p>
                  <blockquote>{claim.quote}</blockquote>
                </article>
              );
            })}
          </div>
          {!!current.result?.sources?.length && (
            <div className="orchestra-research-sources">
              <h4>{localize('com_orchestra_sources_evidence')}</h4>
              {current.result.sources.map((source) => (
                <details key={source.id}>
                  <summary>
                    <span className="min-w-0">
                      <span className="orchestra-source-state">
                        {source.state === 'read' ? '已读取' : '未读取'}
                      </span>
                      <span className="orchestra-source-title">{source.title}</span>
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">
                    {source.url}
                    <ExternalLink size={13} />
                  </a>
                  <p className="orchestra-small-note">
                    {localize('com_orchestra_fetched_at')}
                    {new Date(source.fetched_at).toLocaleString()}
                  </p>
                  <p className="orchestra-source-evidence">
                    {source.state === 'read'
                      ? source.evidence
                      : '未取得网页正文，可能需要登录、被站点限制或服务调用失败。搜索摘要不会作为正文。'}
                  </p>
                </details>
              ))}
            </div>
          )}
          {!active(current) && (
            <div className="orchestra-result-actions">
              {!!current.result?.claims?.length && (
                <button
                  type="button"
                  className="orchestra-primary"
                  disabled={!canImport}
                  onClick={importResult}
                >
                  {localize('com_orchestra_import_draft')}
                  <ArrowRight size={16} />
                </button>
              )}
              {confirmDelete ? (
                <>
                  <span>{localize('com_orchestra_delete_research_prompt')}</span>
                  <button
                    type="button"
                    className="orchestra-secondary"
                    disabled={acting}
                    onClick={() => void mutate(`/queries/${current.id}`, 'DELETE')}
                  >
                    {localize('com_orchestra_confirm_delete')}
                  </button>
                  <button
                    type="button"
                    className="orchestra-secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {localize('com_orchestra_keep')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="orchestra-icon-button"
                  aria-label="删除研究记录"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
