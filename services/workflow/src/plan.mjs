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
  if (roles.size !== plan.roles.length) problems.push('duplicate role id');
  if (tasks.size !== plan.tasks.length) problems.push('duplicate task id');
  if (new Set(plan.tasks.map(t => t.title)).size !== plan.tasks.length) problems.push('duplicate task title');
  for (const t of plan.tasks) {
    if (!roles.has(t.role)) problems.push(`${t.id}: unknown role ${t.role}`);
    for (const d of t.depends_on) if (!tasks.has(d) || d === t.id) problems.push(`${t.id}: unknown dependency ${d}`);
    for (const r of t.review?.reviewers ?? []) {
      if (!roles.has(r)) problems.push(`${t.id}: unknown reviewer ${r}`);
      if (r === t.role) problems.push(`${t.id}: a role cannot review its own work`);
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
  if (plan.tasks.some(t => visit(t.id))) problems.push('dependency cycle');
  if (problems.length) return { ok: false, error: 'invalid_plan', detail: problems.slice(0, 8) };
  return { ok: true, plan };
}

export function requirePlan(value) {
  const result = checkPlan(value);
  if (!result.ok) throw Object.assign(new HttpError(422, result.error), { detail: result.detail });
  return result.plan;
}
