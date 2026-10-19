import { useCallback } from 'react';
import { useAuthContext } from '~/hooks';

export type Review = { mode: 'review' | 'discussion'; reviewers: string[]; max_rounds: number };
export type Role = { id: string; name: string; description: string; instructions: string };
export type Size = 's' | 'm' | 'l';
export type Task = {
  id: string;
  title: string;
  description: string;
  role: string;
  depends_on: string[];
  review: Review | null;
  size?: Size;
  /** Catalog model id; absent means the team default. */
  model?: string;
  tools?: { web: boolean };
  position?: { x: number; y: number };
};
export type ModelInfo = {
  id: string;
  label: string;
  vendor: string;
  category: 'text' | 'image' | 'video' | '3d';
  price: { input: number; output: number } | null;
  available: boolean;
};
export type Plan = { summary: string; roles: Role[]; tasks: Task[] };
export type NodeStatus = 'pending' | 'queued' | 'running' | 'pausing' | 'paused' | 'completed' | 'failed';
export type Activity = {
  kind: 'model' | 'tool';
  agent: string;
  phase?: Phase;
  tool?: string;
  path?: string;
  error?: boolean;
  at: string;
};
export type TaskState = {
  status: NodeStatus;
  output?: string;
  error?: string | null;
  activity?: Activity;
  resumed?: boolean;
  started_at?: string;
  finished_at?: string;
  /** Final nodes only: the files handed to the user. */
  deliverables?: string[];
};
export type Phase = 'work' | 'review' | 'revise';
/** One entry of a node's work record (team_events with type "log", "task" or "queued"/"pause"). */
export type LogEntry = {
  seq: string;
  type: string;
  task_id: string | null;
  created_at: string;
  data: {
    kind?: 'start' | 'text' | 'tool' | 'verdict' | 'end' | 'retry' | 'blocked';
    agent?: string;
    phase?: Phase;
    text?: string;
    tool?: string;
    path?: string;
    detail?: string;
    error?: boolean | string;
    accept?: boolean;
    critique?: string;
    round?: number;
    status?: NodeStatus;
  };
};
export type Estimate = {
  tasks: { id: string; input_tokens: number; output_tokens: number; cost_cny: number }[];
  total_cny: number;
};
export type Run = {
  id: string;
  project_id: string;
  status: string;
  plan_version: number;
  task_states: Record<string, TaskState>;
  error_code: string | null;
  spent_cny: number;
  tokens?: { input: number; output: number };
  created_at: string;
  updated_at: string;
};
export type Project = {
  id: string;
  goal: string;
  workspace_name: string;
  status: 'planning' | 'ready' | 'failed';
  plan: Plan | null;
  plan_version: number;
  error_code: string | null;
  budget_cny: number;
  estimate?: Estimate;
  updated_at: string;
  runs?: Run[];
};
export type TeamFile = { id: string; path: string; task_id: string | null; media_type: string; size: number; sha256: string };
export type FileContent = TeamFile & { encoding: 'utf8' | 'base64'; content: string };

const TOOLS: Record<string, string> = { file_read: '读取', file_write: '写入', file_edit: '修改', glob: '查看文件',
  web_search: '搜索', web_read: '阅读网页', deliver: '登记交付' };
export const toolLabel = (tool?: string) => TOOLS[tool ?? ''] ?? tool ?? '';
export const PHASES: Record<Phase, string> = { work: '工作', review: '审查', revise: '修改' };
/** One short line for the latest model turn or tool call of a running node. */
export function describeActivity(a: Activity | undefined, names: Map<string, string>) {
  if (!a) return '';
  const who = names.get(a.agent) ?? a.agent;
  if (a.kind === 'model') return `${who} · ${a.phase === 'review' ? '审查中' : '思考完成，继续工作'}`;
  return `${who} · ${toolLabel(a.tool)}${a.path ? ` ${a.path}` : ''}${a.error ? '（失败）' : ''}`;
}

const ERRORS: Record<string, string> = {
  model_not_configured: '模型网关未配置，团队暂时无法调用模型。',
  plan_generation_failed: '总指挥没能给出有效方案，请换个说法或重新生成。',
  design_failed: '组建团队失败，请重新生成。',
  run_active: '已有一个团队在工作，请等它结束或先暂停。',
  plan_not_ready: '方案还没准备好。',
  stale_plan: '方案已在别处修改，请刷新后再改。',
  plan_in_progress: '总指挥正在生成方案，请稍候。',
  invalid_plan: '方案有问题：',
  invalid_plan_shape: '方案格式有问题：',
  workflow_invalid: '工作流有错误：',
  task_locked: '已完成或正在运行的节点不能修改：',
  upstream_not_ready: '要先完成前置节点：',
  not_running: '这个节点没有在运行。',
  task_not_found: '找不到这个节点，请先保存画布。',
  invalid_workspace_name: '文件夹名不能包含 \\ / : * ? " < > | 等字符。',
  invalid_goal: '请填写内容（最多 4000 字）。',
  invalid_budget: '预算要在 ¥0.1 到 ¥10000 之间。',
  invalid_attachment_name: '文件名不合法或不是文本格式。',
  attachment_too_large: '文件超过 2 MB。',
  attachment_not_text: '只能上传 UTF-8 文本文件。',
  run_storage_full: '这个团队的文件总量已满（20 MB / 200 个）。',
  invalid_message: '请输入要说的话（最多 4000 字）。',
  model_failed: '模型暂时没有回应，请稍后再试。',
  budget_exhausted: '这个团队的预算已经用完，提高预算后可以继续。',
  tasks_failed: '有节点失败了，可以查看它的工作记录后重新运行。',
  execution_failed: '运行失败，请稍后重试。',
  model_budget_exhausted: '今天的模型总额度用完了，明天 0 点恢复；已写好的文件保留。',
  stalled: '团队长时间没有进展，已自动停止；已写好的文件保留。',
  worker_stalled: '执行程序卡住，已自动重启并停止这次运行；已写好的文件保留。',
};
export const describeError = (code?: string | null, detail?: string[]) =>
  code ? `${ERRORS[code] ?? '服务暂时不可用，请稍后重试。'}${detail?.length ? detail.join('；') : ''}` : '';

const NODE_ERRORS: Record<string, string> = {
  agent_failed: '模型调用失败，可以重新运行这个节点。',
  model_unavailable: '这个节点选的模型没有配置 key，换一个模型或先在服务器配置 key。',
  stalled: '长时间没有进展，已停止。',
  model_budget_exhausted: '今天的模型总额度用完了，明天 0 点恢复。',
  upstream_not_ready: '前置节点没有完成，已退回等待。',
};
export const describeNodeError = (code?: string | null) => (code ? NODE_ERRORS[code] ?? '运行出错。' : '');

export class TeamError extends Error {
  constructor(public code: string, public detail?: string[]) {
    super(describeError(code, detail));
  }
}

/** Calls the workflow service through the chat proxy, which adds the delegated identity. */
export function useTeamApi() {
  const { token } = useAuthContext();
  return useCallback(
    async <T,>(path: string, method = 'GET', body?: unknown, key?: string, signal?: AbortSignal) => {
      const send = (bearer?: string) =>
        fetch(`/api/workflow${path}`, {
          method,
          signal,
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      let response = await send(token);
      // A page left open outlives the short-lived access token; renew it once from
      // the refresh cookie (as the rest of the app does) instead of showing an error.
      if (response.status === 401) {
        const renewed = await fetch('/api/auth/refresh', { method: 'POST' })
          .then((r) => (r.ok ? r.json() : undefined))
          .catch(() => undefined);
        if (renewed?.token) response = await send(renewed.token);
      }
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) throw new TeamError('', ['登录已过期，请重新登录。']);
        throw new TeamError(value.error ?? 'unavailable', value.detail);
      }
      return value as T;
    },
    [token],
  );
}

export const NODE_LABELS: Record<NodeStatus, string> = {
  pending: '未运行',
  queued: '排队中',
  running: '进行中',
  pausing: '正在暂停',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
};
const ACTIVE: NodeStatus[] = ['queued', 'running', 'pausing'];
export const isActive = (status?: NodeStatus) => !!status && ACTIVE.includes(status);
/** Started or finished nodes are frozen; only waiting, paused and failed nodes can change. */
export const isEditable = (status?: NodeStatus) => !status || ['pending', 'paused', 'failed'].includes(status);
export const workingRun = (run?: Run) =>
  !!run && (['queued', 'running'].includes(run.status) || Object.values(run.task_states).some((t) => isActive(t.status)));
export const yuan = (n: number) => `¥${n < 0.01 && n > 0 ? '<0.01' : n.toFixed(2)}`;
