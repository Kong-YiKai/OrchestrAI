import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, FilePen, FileSearch, PauseCircle, Play, RotateCcw, X } from 'lucide-react';
import { NODE_LABELS, PHASES, describeNodeError, isActive, toolLabel, useTeamApi } from './api';
import { FileGroups } from './Deliverables';
import { stateOf } from './plan';
import type { LogEntry, Plan, Run, TeamFile } from './api';
import type { RunFiles } from './Deliverables';

/**
 * A node's work record, kept out of the way until asked for: what it was given (upstream
 * results), what it did (model notes, tool calls, review verdicts), and what it produced.
 */
export default function WorkLog({
  plan,
  run,
  taskId,
  all,
  onOpen,
  onClose,
}: {
  plan: Plan;
  run?: Run;
  taskId: string;
  all: RunFiles;
  onOpen: (file: TeamFile) => void;
  onClose: () => void;
}) {
  const task = plan.tasks.find((t) => t.id === taskId);
  const state = stateOf(run, taskId);
  const entries = useLog(run?.id, taskId, isActive(state.status));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isActive(state.status)) end.current?.scrollIntoView({ block: 'nearest' });
  }, [entries.length, state.status]);
  if (!task) return null;
  const roles = new Map(plan.roles.map((r) => [r.id, r.name]));
  const titles = new Map(plan.tasks.map((t) => [t.id, t.title]));
  const who = (id?: string) => roles.get(id ?? '') ?? id ?? '';
  const upstream = task.depends_on.map((id) => ({ id, state: stateOf(run, id), files: all.list.filter((f) => f.task_id === id) }));
  const produced = all.list.filter((f) => f.task_id === taskId);

  return (
    <aside className="orchestra-team-log" aria-label={`「${task.title}」的工作记录`}>
      <header>
        <div>
          <p className="orchestra-small-note">工作记录 · {who(task.role)}</p>
          <h3>{task.title}</h3>
        </div>
        <span className="orchestra-team-chip" data-state={state.status}>{NODE_LABELS[state.status] ?? state.status}</span>
        <button type="button" className="orchestra-icon-button" aria-label="关闭工作记录" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="orchestra-team-log-body">
        <section>
          <h4>用到的资料</h4>
          {!upstream.length && <p className="orchestra-small-note">这是起点节点，只依据它自己的要求工作。</p>}
          {upstream.map((u) => (
            <details key={u.id} className="orchestra-team-log-input">
              <summary>
                来自「{titles.get(u.id)}」 <small>{NODE_LABELS[u.state.status]}</small>
              </summary>
              {u.state.output ? <p className="orchestra-team-log-text">{u.state.output}</p> : <p className="orchestra-small-note">还没有成果。</p>}
              {u.files.length > 0 && <FileGroups files={u.files} all={all} onOpen={onOpen} />}
            </details>
          ))}
        </section>

        <section>
          <h4>过程</h4>
          {!entries.length && <p className="orchestra-small-note">{run ? '这个节点还没有开始。' : '团队还没有运行。'}</p>}
          <ol className="orchestra-team-log-steps">
            {entries.map((e) => (
              <Step key={e.seq} entry={e} who={who} />
            ))}
          </ol>
          <div ref={end} />
        </section>

        <section>
          <h4>产出</h4>
          {state.error && <p className="orchestra-team-warning">{describeNodeError(state.error)}</p>}
          {state.output ? <p className="orchestra-team-log-text">{state.output}</p> : <p className="orchestra-small-note">完成后在这里列出说明和文件。</p>}
          {produced.length > 0 && <FileGroups files={produced} all={all} onOpen={onOpen} />}
        </section>
      </div>
    </aside>
  );
}

function Step({ entry, who }: { entry: LogEntry; who: (id?: string) => string }) {
  const d = entry.data;
  const time = new Date(entry.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (entry.type === 'queued') return <li className="is-meta"><Play size={13} /> 排队等待运行 <time>{time}</time></li>;
  if (entry.type === 'pause') return <li className="is-meta"><PauseCircle size={13} /> 请求暂停 <time>{time}</time></li>;
  if (entry.type === 'task') {
    return <li className="is-meta" data-state={d.status}>{d.status === 'completed' ? <CheckCircle2 size={13} /> : d.status === 'failed' ? <CircleAlert size={13} /> : <Play size={13} />} {NODE_LABELS[d.status!] ?? d.status} <time>{time}</time></li>;
  }
  switch (d.kind) {
    case 'start':
      return <li className="is-phase">{who(d.agent)} 开始{PHASES[d.phase ?? 'work']}<time>{time}</time></li>;
    case 'text':
      return <li className="is-text"><span>{who(d.agent)}</span><p>{d.text}</p></li>;
    case 'tool':
      return (
        <li className="is-tool" data-error={d.error || undefined}>
          {['file_write', 'file_edit'].includes(d.tool ?? '') ? <FilePen size={13} /> : <FileSearch size={13} />}
          {who(d.agent)} {toolLabel(d.tool)} {d.path && <code>{d.path}</code>}
          {d.error && '（失败）'}
        </li>
      );
    case 'verdict':
      return (
        <li className="is-verdict" data-accept={d.accept}>
          <strong>{who(d.agent)}{d.round ? ` · 第 ${d.round} 轮` : ''}：{d.accept ? '通过' : '提出修改意见'}</strong>
          {d.critique && <p>{d.critique}</p>}
        </li>
      );
    case 'retry':
      return <li className="is-meta"><RotateCcw size={13} /> 模型调用出错，自动重试一次</li>;
    case 'blocked':
      return <li className="is-meta"><CircleAlert size={13} /> 前置节点没有完成，退回等待</li>;
    default:
      return null;
  }
}

/** Reads a node's events page by page and keeps following them while it works. */
function useLog(runId: string | undefined, taskId: string, live: boolean) {
  const call = useTeamApi();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    setEntries([]);
    if (!runId) return;
    let cursor = '0';
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const pull = async () => {
      try {
        for (;;) {
          const page = await call<{ events: LogEntry[]; next_cursor: string }>(`/runs/${runId}/events?task=${taskId}&after=${cursor}`);
          if (stopped) return;
          cursor = page.next_cursor;
          const shown = page.events.filter((e) => e.type === 'log' || e.type === 'task' || (e.type === 'queued' || e.type === 'pause'));
          if (shown.length) setEntries((now) => [...now, ...shown]);
          if (page.events.length < 200) break;
        }
      } catch {
        /* Shown again on the next poll. */
      }
      if (!stopped && live) timer = setTimeout(pull, 2000);
    };
    pull();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, taskId, live, call]);
  return entries;
}
