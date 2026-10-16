import { useCallback } from 'react';
import { useAuthContext } from '~/hooks';

export type Review = { mode: 'review' | 'discussion'; reviewers: string[]; max_rounds: number };
export type Role = { id: string; name: string; description: string; instructions: string };
export type Task = {
  id: string;
  title: string;
  description: string;
  role: string;
  depends_on: string[];
  review: Review | null;
  position?: { x: number; y: number };
};
export type Plan = { summary: string; roles: Role[]; tasks: Task[] };
export type TaskState = { status: string; output?: string };
export type Run = {
  id: string;
  project_id: string;
  status: string;
  plan_version: number;
  task_states: Record<string, TaskState>;
  error_code: string | null;
  plan?: Plan;
  created_at: string;
};
export type Project = {
  id: string;
  goal: string;
  workspace_name: string;
  status: 'planning' | 'ready' | 'failed';
  plan: Plan | null;
  plan_version: number;
  error_code: string | null;
  updated_at: string;
  runs?: Run[];
};
export type TeamFile = { id: string; path: string; task_id: string | null; media_type: string; size: number; sha256: string };
export type FileContent = TeamFile & { encoding: 'utf8' | 'base64'; content: string };

const ERRORS: Record<string, string> = {
  model_not_configured: '模型网关未配置，团队暂时无法调用模型。',
  plan_generation_failed: '总指挥没能给出有效方案，请换个说法或重新生成。',
  design_failed: '组建团队失败，请重新生成。',
  run_active: '已有一个团队在工作，请等它结束或先停止。',
  plan_not_ready: '方案还没准备好。',
  stale_plan: '方案已在别处修改，请刷新后再改。',
  plan_in_progress: '总指挥正在生成方案，请稍候。',
  invalid_plan: '方案有问题：',
  invalid_plan_shape: '方案格式有问题：',
  invalid_workspace_name: '文件夹名不能包含 \\ / : * ? " < > | 等字符。',
  invalid_goal: '请填写目标（最多 4000 字）。',
  budget_exhausted: '本次运行用完了 token 预算。',
  tasks_failed: '部分任务失败。',
  execution_failed: '运行失败，请稍后重试。',
  error: '运行出错。',
  timeout: '运行超时。',
};
export const describeError = (code?: string | null, detail?: string[]) =>
  code ? `${ERRORS[code] ?? '服务暂时不可用，请稍后重试。'}${detail?.length ? detail.join('；') : ''}` : '';

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
      const response = await fetch(`/api/workflow${path}`, {
        method,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
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

export const activeRun = (run?: Run) => !!run && ['queued', 'running'].includes(run.status);
export const RUN_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '工作中',
  completed: '已完成',
  partial: '部分完成',
  failed: '失败',
  cancelled: '已停止',
};
export const TASK_LABELS: Record<string, string> = {
  pending: '等待',
  running: '进行中',
  retrying: '重试中',
  completed: '完成',
  failed: '失败',
  skipped: '跳过',
};
