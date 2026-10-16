import type { Plan, Task } from './api';

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

export function addTask(plan: Plan): { plan: Plan; id: string } {
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
    depends_on: [],
    review: null,
    position: { x: right + X, y: 0 },
  };
  return { plan: { ...plan, tasks: [...plan.tasks, task] }, id };
}

/** Roles still assigned or reviewing cannot be removed. */
export function roleInUse(plan: Plan, id: string) {
  return plan.tasks.some((t) => t.role === id || t.review?.reviewers.includes(id));
}
