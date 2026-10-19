import type { Plan, Run, Task, TaskState } from './api';

const X = 280;
const Y = 150;

/** Layered layout: a task sits one column right of its deepest dependency. */
export function layout(plan: Plan): Plan {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const visit = (id: string, seen = new Set<string>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = byId.get(id)?.depends_on ?? [];
    const value = deps.length ? Math.max(...deps.map((d) => visit(d, seen) + 1)) : 0;
    depth.set(id, value);
    return value;
  };
  const rows = new Map<number, number>();
  return {
    ...plan,
    tasks: plan.tasks.map((t) => {
      const column = visit(t.id);
      const row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return { ...t, position: { x: column * X, y: row * Y } };
    }),
  };
}

export const withPositions = (plan: Plan) =>
  plan.tasks.every((t) => t.position) ? plan : layout(plan);

export function freshId(prefix: string, taken: string[]) {
  for (let n = taken.length + 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** True when making `task` depend on `on` would close a loop. */
export function createsCycle(plan: Plan, task: string, on: string) {
  if (task === on) return true;
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const stack = [on];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === task) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.depends_on ?? []));
  }
  return false;
}

export function updateTask(plan: Plan, id: string, change: Partial<Task>): Plan {
  return { ...plan, tasks: plan.tasks.map((t) => (t.id === id ? { ...t, ...change } : t)) };
}

export function removeTask(plan: Plan, id: string): Plan {
  return {
    ...plan,
    tasks: plan.tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, depends_on: t.depends_on.filter((d) => d !== id) })),
  };
}

/** A new node at `at` (canvas coordinates); with `after`, it depends on that node. */
export function addTask(plan: Plan, at?: { x: number; y: number }, after?: string): { plan: Plan; id: string } {
  const id = freshId('task', plan.tasks.map((t) => t.id));
  const titles = plan.tasks.map((t) => t.title);
  let title = '新任务';
  for (let n = 2; titles.includes(title); n++) title = `新任务 ${n}`;
  const right = Math.max(0, ...plan.tasks.map((t) => t.position?.x ?? 0));
  const task: Task = {
    id,
    title,
    description: '写清楚要做什么、产出哪些文件、怎样算完成。',
    role: plan.roles[0]?.id ?? '',
    depends_on: after ? [after] : [],
    review: null,
    size: 'm',
    position: at ? { x: Math.round(at.x), y: Math.round(at.y) } : { x: right + X, y: 0 },
  };
  return { plan: { ...plan, tasks: [...plan.tasks, task] }, id };
}

/**
 * Same rules the service applies before a team run: every node filled in and part of one
 * connected workflow. Returns readable problems, empty when the team can run.
 */
export function flowProblems(plan: Plan): string[] {
  const problems: string[] = [];
  const roles = new Set(plan.roles.map((r) => r.id));
  const titles = new Set<string>();
  for (const t of plan.tasks) {
    if (!t.title.trim()) problems.push('有节点没有标题');
    else if (titles.has(t.title.trim())) problems.push(`「${t.title}」标题重复`);
    titles.add(t.title.trim());
    if (!roles.has(t.role)) problems.push(`「${t.title}」没有负责角色`);
    if (!t.description.trim()) problems.push(`「${t.title}」没有写要求`);
    if (t.review && !t.review.reviewers.length) problems.push(`「${t.title}」选了把关方式但没有审查者`);
  }
  if (plan.tasks.length > 1) {
    const linked = new Map(plan.tasks.map((t) => [t.id, new Set<string>()]));
    for (const t of plan.tasks) for (const d of t.depends_on) { linked.get(t.id)?.add(d); linked.get(d)?.add(t.id); }
    const seen = new Set([plan.tasks[0].id]);
    for (const queue = [plan.tasks[0].id]; queue.length; ) {
      for (const next of linked.get(queue.pop()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    for (const t of plan.tasks) if (!seen.has(t.id)) problems.push(`「${t.title}」没有连到工作流上`);
  }
  return problems;
}

/** Final nodes: nothing depends on them, so their files are the team's deliverables. */
export function finalTasks(plan: Plan) {
  const used = new Set(plan.tasks.flatMap((t) => t.depends_on));
  return plan.tasks.filter((t) => !used.has(t.id));
}

const LEGACY: Record<string, TaskState['status']> = { skipped: 'pending', retrying: 'failed' };
/** A node's state in the live run; statuses from older releases map onto the node model. */
export function stateOf(run: Run | undefined, id: string): TaskState {
  const state = run?.task_states[id];
  if (!state) return { status: 'pending' };
  return LEGACY[state.status] ? { ...state, status: LEGACY[state.status] } : state;
}

/** Where the team stands: the node to point at and how to describe it. */
export function pointer(plan: Plan, run?: Run): { id?: string; label: string } {
  const by = (status: string) => plan.tasks.find((t) => stateOf(run, t.id).status === status);
  const running = by('running') ?? by('pausing') ?? by('queued');
  if (running) return { id: running.id, label: `进行中：「${running.title}」` };
  const failed = by('failed');
  if (failed) return { id: failed.id, label: `失败：「${failed.title}」` };
  const paused = by('paused');
  if (paused) return { id: paused.id, label: `暂停在：「${paused.title}」` };
  const next = plan.tasks.find((t) => stateOf(run, t.id).status === 'pending' &&
    t.depends_on.every((d) => stateOf(run, d).status === 'completed'));
  if (next && plan.tasks.some((t) => stateOf(run, t.id).status === 'completed')) return { id: next.id, label: `下一步：「${next.title}」` };
  return { label: '' };
}

/** Roles still assigned or reviewing cannot be removed. */
export function roleInUse(plan: Plan, id: string) {
  return plan.tasks.some((t) => t.role === id || t.review?.reviewers.includes(id));
}
