import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { TASK_LABELS } from './api';
import { freshId, removeTask, roleInUse, updateTask } from './plan';
import type { Plan, Review, Role, TaskState } from './api';

/** Side panel: edit the selected task, or the roster when nothing is selected. */
export default function Inspector({
  plan,
  selected,
  editable,
  state,
  onChange,
  onSelect,
}: {
  plan: Plan;
  selected?: string;
  editable: boolean;
  state?: TaskState;
  onChange: (plan: Plan) => void;
  onSelect: (id?: string) => void;
}) {
  const task = plan.tasks.find((t) => t.id === selected);
  if (task) {
    const set = (change: Parameters<typeof updateTask>[2]) => onChange(updateTask(plan, task.id, change));
    const review = task.review;
    const setReview = (change: Partial<Review> | null) =>
      set({
        review:
          change === null
            ? null
            : { mode: 'review', reviewers: [], max_rounds: 1, ...review, ...change },
      });
    const others = plan.roles.filter((r) => r.id !== task.role);
    const titleTaken = plan.tasks.some((t) => t.id !== task.id && t.title === task.title.trim());
    return (
      <aside className="orchestra-team-inspector" aria-label="任务设置">
        <header>
          <h3>任务</h3>
          <button type="button" className="orchestra-icon-button" onClick={() => onSelect(undefined)} aria-label="关闭">
            <X size={16} />
          </button>
        </header>
        {state && (
          <div className="orchestra-team-output">
            <p>状态：{TASK_LABELS[state.status] ?? state.status}</p>
            {state.output && <pre>{state.output}</pre>}
          </div>
        )}
        <label>
          标题
          <input
            value={task.title}
            maxLength={80}
            disabled={!editable}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        {titleTaken && <p className="orchestra-team-warning">标题不能和其他任务重复。</p>}
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
          <textarea
            value={task.description}
            maxLength={4000}
            rows={7}
            disabled={!editable}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>
        <fieldset disabled={!editable}>
          <legend>把关方式</legend>
          <select
            value={review?.mode ?? 'none'}
            onChange={(e) =>
              setReview(e.target.value === 'none' ? null : { mode: e.target.value as Review['mode'] })
            }
          >
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
                        setReview({
                          reviewers: e.target.checked
                            ? [...review.reviewers, r.id]
                            : review.reviewers.filter((x) => x !== r.id),
                        })
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
              <label>
                最多轮数
                <select
                  value={review.max_rounds}
                  onChange={(e) => setReview({ max_rounds: Number(e.target.value) })}
                >
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
          <p className="orchestra-small-note">
            在画布上从一个任务右侧的圆点拖到另一个任务，表示先做前者；选中连线按 Delete 删除。
            没有先后关系的任务会并行。
          </p>
        )}
        {editable && (
          <button
            type="button"
            className="orchestra-secondary orchestra-team-danger"
            onClick={() => {
              onSelect(undefined);
              onChange(removeTask(plan, task.id));
            }}
          >
            <Trash2 size={14} /> 删除任务
          </button>
        )}
      </aside>
    );
  }
  return <Roster plan={plan} editable={editable} onChange={onChange} />;
}

function Roster({ plan, editable, onChange }: { plan: Plan; editable: boolean; onChange: (plan: Plan) => void }) {
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
