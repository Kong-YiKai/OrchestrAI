import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, LayoutGrid, Play, Plus, RefreshCw, Save, Square, Trash2, Users } from 'lucide-react';
import { useAuthContext } from '~/hooks';
import TeamCanvas from './TeamCanvas';
import Inspector from './Inspector';
import Deliverables from './Deliverables';
import { addTask, layout, withPositions } from './plan';
import { canPickFolder, pickFolder, rememberFolder } from './local';
import { RUN_LABELS, TeamError, activeRun, describeError, useTeamApi } from './api';
import type { Plan, Project, Run } from './api';
import './teams.css';

const key = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

/** Agent teams: the commander drafts roles and a task graph, the user edits and runs it. */
export default function Teams({ mode }: { mode: 'canvas' | 'results' }) {
  const call = useTeamApi();
  const client = useQueryClient();
  const { user } = useAuthContext();
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useQuery<{ projects: Project[] }>(
    ['orchestra-teams', user?.id],
    ({ signal }) => call('/projects', 'GET', undefined, undefined, signal),
    { refetchInterval: (data) => (data?.projects.some((p) => p.status === 'planning') ? 3000 : false), retry: false },
  );
  const list = projects.data?.projects ?? [];
  const requested = params.get('team');
  const projectId = requested === 'new' ? undefined : (requested ?? list[0]?.id);
  const choose = (id?: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('team', id ?? 'new');
      next.delete('run');
      return next;
    });

  const project = useQuery<Project>(
    ['orchestra-team', projectId],
    ({ signal }) => call(`/projects/${projectId}`, 'GET', undefined, undefined, signal),
    {
      enabled: !!projectId,
      retry: false,
      refetchInterval: (data) =>
        data?.status === 'planning' || data?.runs?.some(activeRun) ? 2500 : false,
    },
  );
  const current = project.data;
  const runId = params.get('run') ?? current?.runs?.[0]?.id;
  const run = useQuery<Run>(
    ['orchestra-team-run', runId],
    ({ signal }) => call(`/runs/${runId}`, 'GET', undefined, undefined, signal),
    { enabled: !!runId && !!current, retry: false, refetchInterval: (data) => (activeRun(data) ? 2000 : false) },
  );

  const refresh = () =>
    Promise.all([
      client.invalidateQueries(['orchestra-teams']),
      client.invalidateQueries(['orchestra-team', projectId]),
      client.invalidateQueries(['orchestra-team-run']),
    ]);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (failure) {
      setError(failure instanceof TeamError ? failure.message : '服务暂时不可用，请稍后重试。');
    } finally {
      setBusy(false);
    }
  };

  if (projects.isError) {
    return (
      <div className="orchestra-team">
        <p className="orchestra-error">
          团队服务暂时不可用。<button type="button" onClick={() => projects.refetch()}>重试</button>
        </p>
      </div>
    );
  }
  return (
    <div className="orchestra-team">
      <nav className="orchestra-team-projects" aria-label="团队项目">
        {mode === 'canvas' && (
          <button type="button" aria-pressed={!projectId} onClick={() => choose(undefined)}>
            <Plus size={14} /> 新团队
          </button>
        )}
        {list.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === projectId} onClick={() => choose(p.id)} title={p.goal}>
            {p.workspace_name}
            {p.status === 'planning' && <span>组建中</span>}
          </button>
        ))}
        {projects.isLoading && <span className="orchestra-small-note">加载中…</span>}
      </nav>
      {error && (
        <p className="orchestra-error" role="alert">
          {error}
          <button type="button" onClick={() => setError('')}>知道了</button>
        </p>
      )}
      {mode === 'results' ? (
        <Results project={current} run={run.data} onRun={(id) => setParams((p) => { const n = new URLSearchParams(p); n.set('run', id); return n; })} />
      ) : !projectId ? (
        <Create busy={busy} onCreate={(goal, folder, local) => act(async () => {
          const created = await call<Project>('/projects', 'POST', { goal, workspace_name: folder }, key());
          if (local) await rememberFolder(created.id, local);
          choose(created.id);
        })} />
      ) : !current ? (
        <p className="orchestra-small-note orchestra-team-pad">{project.isError ? '找不到这个团队。' : '加载中…'}</p>
      ) : (
        <Board
          key={current.id}
          project={current}
          run={run.data?.project_id === current.id ? run.data : undefined}
          busy={busy}
          act={act}
          onDeleted={() => choose(list.find((p) => p.id !== current.id)?.id)}
        />
      )}
    </div>
  );
}

function Create({ busy, onCreate }: { busy: boolean; onCreate: (goal: string, folder: string, local?: FileSystemDirectoryHandle) => void }) {
  const [goal, setGoal] = useState('');
  const [named, setNamed] = useState<string | null>(null);
  const fallback = goal.replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 16) || `团队成果-${today()}`;
  const folder = named ?? fallback;
  const [local, setLocal] = useState<FileSystemDirectoryHandle>();
  const invalid = /[\\/:*?"<>|]/.test(folder) || !folder.trim();
  return (
    <form
      className="orchestra-team-create"
      onSubmit={(e) => {
        e.preventDefault();
        if (goal.trim() && !invalid) onCreate(goal.trim(), folder.trim(), local);
      }}
    >
      <p className="orchestra-eyebrow">AGENT TEAM</p>
      <h2>说出目标，总指挥来组建团队。</h2>
      <p className="orchestra-small-note">
        总指挥会按目标设计角色（如策划、美术、程序、音效、镜头、审批）和工作流：哪些串行、哪些并行、哪里互审或讨论。
        生成后你可以在画布上修改，再开始运行。团队只能产出文本类文件（文档、网页、代码、SVG、表格等）。
      </p>
      <label>
        目标
        <textarea
          value={goal}
          maxLength={4000}
          rows={5}
          placeholder="例如：为一款像素风解谜游戏做一份策划案，并做一个可以在浏览器里打开的介绍网页。"
          onChange={(e) => setGoal(e.target.value)}
        />
      </label>
      <label>
        成果文件夹名
        <input value={folder} maxLength={64} onChange={(e) => setNamed(e.target.value)} />
      </label>
      {invalid && <p className="orchestra-team-warning">文件夹名不能为空，也不能包含 \ / : * ? " &lt; &gt; |</p>}
      {canPickFolder() && (
        <div className="orchestra-team-local">
          <button
            type="button"
            className="orchestra-secondary"
            onClick={async () => {
              try {
                setLocal(await pickFolder());
              } catch {
                /* Picker dismissed. */
              }
            }}
          >
            <FolderOpen size={15} /> {local ? `保存位置：${local.name}` : '选择本地保存位置（可选）'}
          </button>
          <span>成果会写到「所选位置/{folder || '…'}」下，建议选 D 盘的工作目录；也可以之后再选。</span>
        </div>
      )}
      <button type="submit" className="orchestra-primary" disabled={busy || !goal.trim() || invalid}>
        <Users size={15} /> 组建团队
      </button>
    </form>
  );
}

function Board({
  project,
  run,
  busy,
  act,
  onDeleted,
}: {
  project: Project;
  run?: Run;
  busy: boolean;
  act: (work: () => Promise<unknown>) => Promise<void>;
  onDeleted: () => void;
}) {
  const call = useTeamApi();
  const [draft, setDraft] = useState<Plan | undefined>(project.plan ? withPositions(project.plan) : undefined);
  const [base, setBase] = useState(project.plan_version);
  const [selected, setSelected] = useState<string>();
  const [watching, setWatching] = useState(activeRun(run));
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // A newer server plan (first design, regeneration) replaces an unchanged draft.
  useEffect(() => {
    if (project.plan && project.plan_version !== base) {
      setDraft(withPositions(project.plan));
      setBase(project.plan_version);
    }
  }, [project.plan, project.plan_version, base]);
  useEffect(() => {
    if (activeRun(run)) setWatching(true);
  }, [run]);

  const dirty = useMemo(
    () => !!draft && !!project.plan && JSON.stringify(draft) !== JSON.stringify(withPositions(project.plan)),
    [draft, project.plan],
  );
  const running = activeRun(run);
  const showRun = watching && !!run?.plan;
  const plan = showRun ? withPositions(run!.plan!) : draft;
  const save = async () => {
    if (!draft || !dirty) return project.plan_version;
    const saved = await call<Project>(`/projects/${project.id}/plan`, 'PUT', { version: project.plan_version, plan: draft });
    setBase(saved.plan_version);
    return saved.plan_version;
  };

  if (project.status === 'planning') {
    return (
      <div className="orchestra-team-wait">
        <RefreshCw size={22} className="animate-spin" />
        <h3>总指挥正在组建团队…</h3>
        <p className="orchestra-small-note">{project.goal}</p>
      </div>
    );
  }
  if (project.status === 'failed' || !plan) {
    return (
      <div className="orchestra-team-wait">
        <h3>没能组建团队</h3>
        <p className="orchestra-small-note">{describeError(project.error_code ?? 'design_failed')}</p>
        <button type="button" className="orchestra-primary" disabled={busy} onClick={() => act(() => call(`/projects/${project.id}/design`, 'POST', {}))}>
          <RefreshCw size={15} /> 重新生成
        </button>
      </div>
    );
  }
  const editable = !showRun;
  return (
    <div className="orchestra-team-board">
      <div className="orchestra-team-toolbar">
        <div className="orchestra-team-goal" title={project.goal}>
          <strong>{project.workspace_name}</strong>
          <span>{project.goal}</span>
        </div>
        {run && (
          <div className="orchestra-view-tabs orchestra-team-switch">
            <button type="button" aria-current={!showRun ? 'page' : undefined} onClick={() => setWatching(false)}>方案</button>
            <button type="button" aria-current={showRun ? 'page' : undefined} onClick={() => setWatching(true)}>
              运行 · {RUN_LABELS[run.status] ?? run.status}
            </button>
          </div>
        )}
        <div className="orchestra-team-actions">
          {editable && (
            <>
              <button type="button" className="orchestra-secondary" onClick={() => { const next = addTask(draft!); setDraft(next.plan); setSelected(next.id); }} disabled={draft!.tasks.length >= 30}>
                <Plus size={14} /> 任务
              </button>
              <button type="button" className="orchestra-secondary" onClick={() => setDraft(layout(draft!))}>
                <LayoutGrid size={14} /> 排列
              </button>
              <button type="button" className="orchestra-secondary" disabled={!dirty || busy} onClick={() => act(save)}>
                <Save size={14} /> 保存
              </button>
            </>
          )}
          {running ? (
            <button type="button" className="orchestra-secondary" disabled={busy} onClick={() => act(() => call(`/runs/${run!.id}/cancel`, 'POST', {}))}>
              <Square size={14} /> 停止
            </button>
          ) : (
            <button
              type="button"
              className="orchestra-primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await save();
                  await call(`/projects/${project.id}/runs`, 'POST', {}, key());
                  setWatching(true);
                })
              }
            >
              <Play size={14} /> 运行团队
            </button>
          )}
        </div>
      </div>
      {notice && <p className="orchestra-team-warning orchestra-team-pad">{notice}</p>}
      {showRun && run?.error_code && <p className="orchestra-team-warning orchestra-team-pad">{describeError(run.error_code)}</p>}
      <div className="orchestra-team-body">
        <TeamCanvas
          plan={plan}
          states={showRun ? run?.task_states : undefined}
          editable={editable}
          selected={selected}
          onSelect={setSelected}
          onChange={(next) => { setNotice(''); setDraft(next); }}
          onRefuse={setNotice}
        />
        <div className="orchestra-team-side">
          {showRun && run && !selected && (
            <div className="orchestra-team-inspector">
              <h3>成果</h3>
              <Deliverables runId={run.id} project={project.id} workspace={project.workspace_name} live={running} />
            </div>
          )}
          <Inspector
            plan={plan}
            selected={selected}
            editable={editable}
            state={showRun && selected ? run?.task_states[selected] : undefined}
            onChange={setDraft}
            onSelect={setSelected}
          />
          {editable && (
            <div className="orchestra-team-inspector orchestra-team-manage">
              <button type="button" className="orchestra-secondary" disabled={busy || running} onClick={() => act(() => call(`/projects/${project.id}/design`, 'POST', {}))}>
                <RefreshCw size={14} /> 让总指挥重新生成
              </button>
              {confirmDelete ? (
                <button type="button" className="orchestra-secondary orchestra-team-danger" disabled={busy || running} onClick={() => act(async () => { await call(`/projects/${project.id}`, 'DELETE'); onDeleted(); })}>
                  <Trash2 size={14} /> 确认删除团队和所有成果
                </button>
              ) : (
                <button type="button" className="orchestra-secondary" disabled={running} onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={14} /> 删除团队
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Results({ project, run, onRun }: { project?: Project; run?: Run; onRun: (id: string) => void }) {
  if (!project) return <p className="orchestra-small-note orchestra-team-pad">还没有团队。到「画布」里说出目标，组建第一个团队。</p>;
  const runs = project.runs ?? [];
  if (!runs.length) return <p className="orchestra-small-note orchestra-team-pad">这个团队还没有运行过。</p>;
  return (
    <div className="orchestra-team-results">
      <nav aria-label="运行记录">
        {runs.map((r) => (
          <button key={r.id} type="button" aria-pressed={r.id === run?.id} onClick={() => onRun(r.id)}>
            {new Date(r.created_at).toLocaleString('zh-CN')} · {RUN_LABELS[r.status] ?? r.status}
          </button>
        ))}
      </nav>
      {run && <Deliverables runId={run.id} project={project.id} workspace={project.workspace_name} live={activeRun(run)} />}
    </div>
  );
}
