import { useState } from 'react';
import { FileClock, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { NODE_LABELS, describeNodeError, isActive, isEditable, yuan } from './api';
import { freshId, removeTask, roleInUse, stateOf, updateTask } from './plan';
import type { Estimate, Plan, Review, Role, Run, Size } from './api';

const SIZES: Record<Size, string> = { s: '小', m: '中', l: '大' };

/** Side panel for the selected node: its actions, its settings, and the way to its work record. */
export default function Inspector({
  plan,
  run,
  selected,
  estimate,
  busy,
  onChange,
  onSelect,
  onAction,
  onLog,
}: {
  plan: Plan;
  run?: Run;
  selected: string;
  estimate?: Estimate;
  busy: boolean;
  onChange: (plan: Plan) => void;
  onSelect: (id?: string) => void;
  onAction: (action: 'run' | 'pause', task: string) => void;
  onLog: (task: string) => void;
}) {
  const task = plan.tasks.find((t) => t.id === selected);
  if (!task) return null;
  const state = stateOf(run, task.id);
  const editable = isEditable(state.status);
  const set = (change: Parameters<typeof updateTask>[2]) => onChange(updateTask(plan, task.id, change));
  const review = task.review;
  const setReview = (change: Partial<Review> | null) =>
    set({ review: change === null ? null : { mode: 'review', reviewers: [], max_rounds: 1, ...review, ...change } });
  const others = plan.roles.filter((r) => r.id !== task.role);
  const titleTaken = plan.tasks.some((t) => t.id !== task.id && t.title === task.title.trim());
  const waiting = task.depends_on.filter((d) => !['completed', 'queued', 'running'].includes(stateOf(run, d).status));
  const cost = estimate?.tasks.find((t) => t.id === task.id);
  const titles = new Map(plan.tasks.map((t) => [t.id, t.title]));
  return (
    <aside className="orchestra-team-inspector" aria-label="节点设置">
      <header>
        <h3>节点</h3>
        <span className="orchestra-team-chip" data-state={state.status}>{NODE_LABELS[state.status] ?? state.status}</span>
        <button type="button" className="orchestra-icon-button" onClick={() => onSelect(undefined)} aria-label="关闭">
          <X size={16} />
        </button>
      </header>
      <div className="orchestra-team-node-actions">
        {isActive(state.status) ? (
          <button type="button" className="orchestra-secondary" disabled={busy || state.status === 'pausing'} onClick={() => onAction('pause', task.id)}>
            <Pause size={14} /> {state.status === 'pausing' ? '正在暂停…' : '暂停'}
          </button>
        ) : state.status !== 'completed' ? (
          <button type="button" className="orchestra-primary" disabled={busy || waiting.length > 0} onClick={() => onAction('run', task.id)}>
            <Play size={14} /> {state.status === 'paused' ? '继续这个节点' : state.status === 'failed' ? '重新运行' : '运行这个节点'}
          </button>
        ) : null}
        <button type="button" className="orchestra-secondary" onClick={() => onLog(task.id)}>
          <FileClock size={14} /> 工作记录
        </button>
      </div>
      {waiting.length > 0 && !isActive(state.status) && state.status !== 'completed' && (
        <p className="orchestra-small-note">要先完成：{waiting.map((d) => `「${titles.get(d)}」`).join('、')}</p>
      )}
      {state.status === 'completed' && <p className="orchestra-small-note">已完成的节点已锁定，不能修改或删除。</p>}
      {isActive(state.status) && <p className="orchestra-small-note">运行中不能修改；暂停后可以改要求再继续。</p>}
      {state.error && <p className="orchestra-team-warning">{describeNodeError(state.error)}</p>}
      <label>
        标题
        <input value={task.title} maxLength={80} disabled={!editable} onChange={(e) => set({ title: e.target.value })} />
      </label>
      {titleTaken && <p className="orchestra-team-warning">标题不能和其他节点重复。</p>}
      <label>
        负责角色
        <select value={task.role} disabled={!editable} onChange={(e) => set({ role: e.target.value })}>
          {plan.roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        要求与产出
        <textarea value={task.description} maxLength={4000} rows={7} disabled={!editable} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <label>
        工作量{cost ? `（预估约 ${yuan(cost.cost_cny)}）` : ''}
        <select value={task.size ?? 'm'} disabled={!editable} onChange={(e) => set({ size: e.target.value as Size })}>
          {(Object.keys(SIZES) as Size[]).map((k) => (
            <option key={k} value={k}>
              {SIZES[k]}
            </option>
          ))}
        </select>
      </label>
      <fieldset disabled={!editable}>
        <legend>把关方式</legend>
        <select value={review?.mode ?? 'none'} onChange={(e) => setReview(e.target.value === 'none' ? null : { mode: e.target.value as Review['mode'] })}>
          <option value="none">不审查</option>
          <option value="review">互审：审查者挑错，作者修改</option>
          <option value="discussion">讨论：各角色从专业角度提意见</option>
        </select>
        {review && (
          <>
            <div className="orchestra-team-chips">
              {others.map((r) => (
                <label key={r.id}>
                  <input
                    type="checkbox"
                    checked={review.reviewers.includes(r.id)}
                    disabled={!review.reviewers.includes(r.id) && review.reviewers.length >= 4}
                    onChange={(e) =>
                      setReview({ reviewers: e.target.checked ? [...review.reviewers, r.id] : review.reviewers.filter((x) => x !== r.id) })
                    }
                  />
                  {r.name}
                </label>
              ))}
            </div>
            <label>
              最多轮数
              <select value={review.max_rounds} onChange={(e) => setReview({ max_rounds: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {!review.reviewers.length && <p className="orchestra-team-warning">请至少选一位审查者。</p>}
          </>
        )}
      </fieldset>
      {editable && (
        <button
          type="button"
          className="orchestra-secondary orchestra-team-danger"
          onClick={() => {
            onSelect(undefined);
            onChange(removeTask(plan, task.id));
          }}
        >
          <Trash2 size={14} /> 删除节点
        </button>
      )}
    </aside>
  );
}

export function Roster({ plan, editable, onChange }: { plan: Plan; editable: boolean; onChange: (plan: Plan) => void }) {
  const [open, setOpen] = useState<string>();
  const [notice, setNotice] = useState('');
  const setRole = (id: string, change: Partial<Role>) =>
    onChange({ ...plan, roles: plan.roles.map((r) => (r.id === id ? { ...r, ...change } : r)) });
  return (
    <aside className="orchestra-team-inspector" aria-label="团队角色">
      <header>
        <h3>团队角色 · {plan.roles.length}</h3>
        {editable && plan.roles.length < 12 && (
          <button
            type="button"
            className="orchestra-icon-button"
            aria-label="添加角色"
            onClick={() => {
              const id = freshId('role', plan.roles.map((r) => r.id));
              onChange({
                ...plan,
                roles: [
                  ...plan.roles,
                  { id, name: '新角色', description: '负责什么', instructions: '怎样工作、产出什么格式、质量标准' },
                ],
              });
              setOpen(id);
            }}
          >
            <Plus size={16} />
          </button>
        )}
      </header>
      <p className="orchestra-team-summary">{plan.summary}</p>
      {notice && <p className="orchestra-team-warning">{notice}</p>}
      {plan.roles.map((role) => (
        <details key={role.id} open={open === role.id} onToggle={(e) => e.currentTarget.open && setOpen(role.id)}>
          <summary>
            <strong>{role.name}</strong>
            <span>{role.description}</span>
          </summary>
          <label>
            名称
            <input value={role.name} maxLength={40} disabled={!editable} onChange={(e) => setRole(role.id, { name: e.target.value })} />
          </label>
          <label>
            职责
            <textarea value={role.description} maxLength={300} rows={2} disabled={!editable} onChange={(e) => setRole(role.id, { description: e.target.value })} />
          </label>
          <label>
            工作方法
            <textarea value={role.instructions} maxLength={4000} rows={6} disabled={!editable} onChange={(e) => setRole(role.id, { instructions: e.target.value })} />
          </label>
          {editable && (
            <button
              type="button"
              className="orchestra-secondary orchestra-team-danger"
              onClick={() => {
                if (roleInUse(plan, role.id)) {
                  setNotice(`「${role.name}」还在负责或审查任务，先把这些任务改给别人。`);
                  return;
                }
                setNotice('');
                onChange({ ...plan, roles: plan.roles.filter((r) => r.id !== role.id) });
              }}
            >
              <Trash2 size={14} /> 删除角色
            </button>
          )}
        </details>
      ))}
    </aside>
  );
}
