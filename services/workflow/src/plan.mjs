import { z } from 'zod';
import { HttpError } from './auth.mjs';

// A team plan: the commander's roster (roles are invented per goal, not a fixed list)
// and a task graph. Serial/parallel order comes from depends_on; a task's `review`
// adds peer review (refute) or a multi-perspective discussion (lens) before it counts.
export const LIMITS = { roles: 12, tasks: 30, reviewers: 4 };
const id = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const text = max => z.string().trim().min(1).max(max);

const role = z.object({
  id,
  name: text(40),
  description: text(300),
  instructions: text(4000),
}).strict();

const task = z.object({
  id,
  title: text(80),
  description: text(4000),
  role: id,
  depends_on: z.array(id).max(10).default([]),
  review: z.object({
    mode: z.enum(['review', 'discussion']),
    reviewers: z.array(id).min(1).max(LIMITS.reviewers),
    max_rounds: z.number().int().min(1).max(3).default(2),
  }).strict().nullable().default(null),
  // The commander's size guess drives the cost estimate shown before anything runs.
  size: z.enum(['s', 'm', 'l']).default('m'),
  // A catalog model id (gateway models.json); absent means the team's default model.
  model: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,39}$/).optional(),
  // Capabilities beyond reading and writing workspace files.
  tools: z.object({ web: z.boolean() }).strict().optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
}).strict();

export const planSchema = z.object({
  summary: text(600),
  roles: z.array(role).min(1).max(LIMITS.roles),
  tasks: z.array(task).min(1).max(LIMITS.tasks),
}).strict();

/** Structural checks zod cannot express: references, unique names, and no cycles. */
export function checkPlan(value) {
  const parsed = planSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'invalid_plan_shape', detail: parsed.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) };
  const plan = parsed.data;
  const roles = new Set(plan.roles.map(r => r.id));
  const tasks = new Map(plan.tasks.map(t => [t.id, t]));
  const problems = [];
  const name = t => `「${t.title}」`;
  if (roles.size !== plan.roles.length) problems.push('角色 id 重复');
  if (tasks.size !== plan.tasks.length) problems.push('任务 id 重复');
  if (new Set(plan.tasks.map(t => t.title)).size !== plan.tasks.length) problems.push('任务标题重复');
  for (const t of plan.tasks) {
    if (!roles.has(t.role)) problems.push(`${name(t)} 的角色不存在`);
    for (const d of t.depends_on) if (!tasks.has(d) || d === t.id) problems.push(`${name(t)} 依赖的任务不存在`);
    for (const r of t.review?.reviewers ?? []) {
      if (!roles.has(r)) problems.push(`${name(t)} 的审查角色不存在`);
      if (r === t.role) problems.push(`${name(t)} 不能由自己的角色审查`);
    }
  }
  const state = new Map();
  const visit = node => {
    if (state.get(node) === 'done') return false;
    if (state.get(node) === 'active') return true;
    state.set(node, 'active');
    const cycle = (tasks.get(node)?.depends_on ?? []).some(visit);
    state.set(node, 'done');
    return cycle;
  };
  if (plan.tasks.some(t => visit(t.id))) problems.push('连线形成了循环');
  if (problems.length) return { ok: false, error: 'invalid_plan', detail: problems.slice(0, 8) };
  return { ok: true, plan };
}

/**
 * A plan that can be saved may still be unfinished on the canvas. Before running, every
 * task must belong to one connected workflow: a node left without any link is an error.
 */
export function checkRunnable(plan) {
  const checked = checkPlan(plan);
  if (!checked.ok) return checked;
  const linked = new Map(plan.tasks.map(t => [t.id, new Set()]));
  for (const t of plan.tasks) for (const d of t.depends_on) { linked.get(t.id).add(d); linked.get(d).add(t.id); }
  const seen = new Set([plan.tasks[0].id]);
  for (const queue = [plan.tasks[0].id]; queue.length;) for (const next of linked.get(queue.pop())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  const loose = plan.tasks.filter(t => !seen.has(t.id)).map(t => `「${t.title}」没有连到工作流上`);
  return loose.length ? { ok: false, error: 'workflow_invalid', detail: loose.slice(0, 8) } : checked;
}

/** Tasks that started or finished are frozen: only their canvas position may change. */
export function lockViolations(before, after, states) {
  const next = new Map(after.tasks.map(t => [t.id, t]));
  const frozen = value => { const { position, ...task } = planSchema.shape.tasks.element.parse(value); return JSON.stringify(task); };
  const problems = [];
  for (const t of before.tasks) {
    const status = states?.[t.id]?.status;
    if (!['completed', 'running', 'queued', 'pausing'].includes(status)) continue;
    const label = status === 'completed' ? '已完成' : '正在运行';
    if (!next.has(t.id)) problems.push(`「${t.title}」${label}，不能删除`);
    else if (frozen(next.get(t.id)) !== frozen(t)) problems.push(`「${t.title}」${label}，不能修改`);
  }
  return problems;
}

// Token use per task, calibrated on production runs (5 medium tasks with one review and one
// discussion used about 525k input and 33k output tokens).
const SIZE = { s: 0.5, m: 1, l: 2 };
const WORK = { input: 60000, output: 5000 };
const JUDGE = { input: 30000, output: 1500 };
const REVISE = { input: 40000, output: 3000 };

/** Cost estimate per task in CNY, from the model price table (CNY per million tokens). */
export function estimate(plan, priceOf) {
  const tasks = plan.tasks.map(t => {
    const f = SIZE[t.size ?? 'm'];
    let input = WORK.input * f, output = WORK.output * f;
    if (t.review) {
      const rounds = t.review.max_rounds, judges = t.review.reviewers.length;
      input += rounds * (judges * JUDGE.input + REVISE.input * f);
      output += rounds * (judges * JUDGE.output + REVISE.output * f);
    }
    const price = priceOf(t);
    return { id: t.id, input_tokens: Math.round(input), output_tokens: Math.round(output),
      cost_cny: Math.round((input * price.input + output * price.output) / 1e4) / 100 };
  });
  return { tasks, total_cny: Math.round(tasks.reduce((sum, t) => sum + t.cost_cny, 0) * 100) / 100 };
}

export function requirePlan(value) {
  const result = checkPlan(value);
  if (!result.ok) throw Object.assign(new HttpError(422, result.error), { detail: result.detail });
  return result.plan;
}
