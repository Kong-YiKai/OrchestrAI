import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Crosshair, MessageSquare, FolderOpen, LayoutGrid, Pause, Play, Plus, RefreshCw, Save, Trash2, Users, Wallet } from 'lucide-react';
import { useAuthContext } from '~/hooks';
import TeamCanvas from './TeamCanvas';
import Inspector, { Roster } from './Inspector';
import Deliverables, { FilePreview, useRunFiles } from './Deliverables';
import WorkLog from './WorkLog';
import NodeChat from './NodeChat';
import { addTask, finalTasks, flowProblems, layout, pointer, stateOf, withPositions } from './plan';
import { canPickFolder, pickFolder, rememberFolder } from './local';
import { TeamError, describeError, isActive, useTeamApi, workingRun, yuan } from './api';
import type { Plan, Project, Run, TeamFile } from './api';
import './teams.css';

const key = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

/** Agent teams: the commander drafts roles and a node graph, the user edits and runs it. */
export default function Teams() {
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
      return next;
    });

  const project = useQuery<Project>(
    ['orchestra-team', projectId],
    ({ signal }) => call(`/projects/${projectId}`, 'GET', undefined, undefined, signal),
    {
      enabled: !!projectId,
      retry: false,
      refetchInterval: (data) =>
        data?.status === 'planning' || workingRun(data?.runs?.[0]) ? 2000 : false,
    },
  );
  const current = project.data;

  const refresh = () =>
    Promise.all([
      client.invalidateQueries(['orchestra-teams']),
      client.invalidateQueries(['orchestra-team', projectId]),
      client.invalidateQueries(['orchestra-team-files']),
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
        <button type="button" aria-pressed={!projectId} onClick={() => choose(undefined)}>
          <Plus size={14} /> 新团队
        </button>
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
      {!projectId ? (
        <Create busy={busy} onCreate={(goal, folder, budget, local) => act(async () => {
          const created = await call<Project>('/projects', 'POST', { goal, workspace_name: folder, budget_cny: budget }, key());
          if (local) await rememberFolder(created.id, local);
          choose(created.id);
        })} />
      ) : !current ? (
        <p className="orchestra-small-note orchestra-team-pad">{project.isError ? '找不到这个团队。' : '加载中…'}</p>
      ) : (
        <Board
          key={current.id}
          project={current}
          busy={busy}
          act={act}
          onDeleted={() => choose(list.find((p) => p.id !== current.id)?.id)}
        />
      )}
    </div>
  );
}

function Create({ busy, onCreate }: { busy: boolean; onCreate: (goal: string, folder: string, budget: number, local?: FileSystemDirectoryHandle) => void }) {
  const [goal, setGoal] = useState('');
  const [budget, setBudget] = useState('5');
  const amount = Number(budget);
  const badBudget = !Number.isFinite(amount) || amount < 0.1 || amount > 10000;
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
        if (goal.trim() && !invalid && !badBudget) onCreate(goal.trim(), folder.trim(), Math.round(amount * 100) / 100, local);
      }}
    >
      <p className="orchestra-eyebrow">AGENT TEAM</p>
      <h2>说出目标，总指挥来组建团队。</h2>
      <p className="orchestra-small-note">
        总指挥会按目标设计角色（如策划、美术、程序、音效、镜头、审批）和工作流：哪些串行、哪些并行、哪里互审或讨论。
        生成后会按节点估算花费，你可以在画布上修改，再开始运行。团队只能产出文本类文件（文档、网页、代码、SVG、表格等）。
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
      <label>
        这个任务的预算（元）
        <input type="number" inputMode="decimal" min={0.1} max={10000} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} />
        <span className="orchestra-small-note">花完预算会自动暂停，可以随时提高预算后继续。生成工作流后会先给出预估花费。</span>
      </label>
      {badBudget && <p className="orchestra-team-warning">预算要在 ¥0.1 到 ¥10000 之间。</p>}
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
      <button type="submit" className="orchestra-primary" disabled={busy || !goal.trim() || invalid || badBudget}>
        <Users size={15} /> 组建团队
      </button>
    </form>
  );
}

type Panel = 'budget' | 'redesign' | 'confirm' | 'delete' | undefined;

function Board({
  project,
  busy,
  act,
  onDeleted,
}: {
  project: Project;
  busy: boolean;
  act: (work: () => Promise<unknown>) => Promise<void>;
  onDeleted: () => void;
}) {
  const call = useTeamApi();
  const run: Run | undefined = project.runs?.[0];
  const [draft, setDraft] = useState<Plan | undefined>(project.plan ? withPositions(project.plan) : undefined);
  const [base, setBase] = useState(project.plan_version);
  const [selected, setSelected] = useState<string>();
  const [log, setLog] = useState<string>();
  const [chat, setChat] = useState<string>();
  const [preview, setPreview] = useState<TeamFile>();
  const [notice, setNotice] = useState('');
  const [focus, setFocus] = useState(0);
  const [panel, setPanel] = useState<Panel>();
  const [budget, setBudget] = useState(String(project.budget_cny));
  const [instructions, setInstructions] = useState('');
  const working = workingRun(run);
  const files = useRunFiles(run?.id, working, run?.updated_at);

  // A newer server plan (first design, redesign) replaces the draft.
  useEffect(() => {
    if (project.plan && project.plan_version !== base) {
      setDraft(withPositions(project.plan));
      setBase(project.plan_version);
    }
  }, [project.plan, project.plan_version, base]);
  const dirty = useMemo(
    () => !!draft && !!project.plan && JSON.stringify(draft) !== JSON.stringify(withPositions(project.plan)),
    [draft, project.plan],
  );
  const save = async () => {
    if (!draft || !dirty) return;
    const saved = await call<Project>(`/projects/${project.id}/plan`, 'PUT', { version: project.plan_version, plan: draft });
    setBase(saved.plan_version);
  };
  const control = (action: 'run' | 'pause', task?: string) =>
    act(async () => {
      if (action === 'run') await save();
      await call(`/projects/${project.id}/control`, 'POST', { action, ...(task ? { task } : {}) });
    });

  if (project.status === 'planning') {
    return (
      <div className="orchestra-team-wait">
        <RefreshCw size={22} className="animate-spin" />
        <h3>总指挥正在设计工作流…</h3>
        <p className="orchestra-small-note">{project.goal}</p>
      </div>
    );
  }
  if (project.status === 'failed' || !draft) {
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

  const plan = draft;
  const status = (id: string) => stateOf(run, id).status;
  const done = plan.tasks.filter((t) => status(t.id) === 'completed').length;
  const allDone = plan.tasks.length > 0 && done === plan.tasks.length;
  const active = plan.tasks.some((t) => isActive(status(t.id)));
  const pausing = active && !plan.tasks.some((t) => ['running', 'queued'].includes(status(t.id)));
  const paused = !active && plan.tasks.some((t) => status(t.id) === 'paused');
  const started = plan.tasks.some((t) => status(t.id) !== 'pending');
  const point = pointer(plan, run);
  const spent = run?.spent_cny ?? 0;
  const left = (project.estimate?.tasks ?? []).filter((t) => status(t.id) !== 'completed').reduce((sum, t) => sum + t.cost_cny, 0);
  const finals = finalTasks(plan);
  const delivered = new Set(finals.flatMap((t) => stateOf(run, t.id).deliverables ?? []));
  const deliverables = files.list.filter((f) => delivered.has(f.path) ||
    (!f.path.startsWith('inputs/') && finals.some((t) => t.id === f.task_id) && !stateOf(run, f.task_id!).deliverables));
  const openLog = (id: string) => { setChat(undefined); setLog(id); };
  const openChat = (id: string) => { setLog(undefined); setChat(id); };
  const runTeam = (confirmed = false) => {
    const problems = flowProblems(plan);
    if (problems.length) return setNotice(`工作流有错误：${problems.join('；')}`);
    if (!confirmed && left > project.budget_cny - spent) return setPanel('confirm');
    setPanel(undefined);
    control('run');
  };

  return (
    <div className="orchestra-team-board">
      <div className="orchestra-team-toolbar">
        <div className="orchestra-team-goal" title={project.goal}>
          <strong>{project.workspace_name}</strong>
          <span>{project.goal}</span>
        </div>
        {project.conversation_id && (
          <Link className="orchestra-secondary orchestra-team-source" to={`/c/${project.conversation_id}`} title="回到确认需求的那段对话">
            <MessageSquare size={15} /> 需求对话
          </Link>
        )}
        <button type="button" className="orchestra-team-progress" disabled={!point.id} onClick={() => { setSelected(point.id); setFocus((n) => n + 1); }}>
          <span>{done}/{plan.tasks.length} 完成</span>
          {point.label && <em><Crosshair size={12} /> {point.label}</em>}
        </button>
        <button type="button" className="orchestra-team-budget" aria-expanded={panel === 'budget'} onClick={() => setPanel(panel === 'budget' ? undefined : 'budget')}>
          <Wallet size={14} />
          <span>{yuan(spent)} / {yuan(project.budget_cny)}</span>
          {project.estimate && <small>预估 {yuan(project.estimate.total_cny)}</small>}
          <i style={{ width: `${Math.min(100, (spent / project.budget_cny) * 100)}%` }} />
        </button>
        <div className="orchestra-team-actions">
          <button type="button" className="orchestra-secondary" disabled={plan.tasks.length >= 30} onClick={() => { const next = addTask(plan); setDraft(next.plan); setSelected(next.id); }}>
            <Plus size={14} /> 节点
          </button>
          <button type="button" className="orchestra-secondary" onClick={() => setDraft(layout(plan))}>
            <LayoutGrid size={14} /> 排列
          </button>
          {dirty && (
            <button type="button" className="orchestra-secondary" disabled={busy} onClick={() => act(save)}>
              <Save size={14} /> 保存
            </button>
          )}
          {allDone ? (
            <button type="button" className="orchestra-primary" disabled>
              <CheckCircle2 size={14} /> 已完成
            </button>
          ) : active ? (
            <button type="button" className="orchestra-primary" disabled={busy || pausing} onClick={() => control('pause')}>
              <Pause size={14} /> {pausing ? '正在暂停…' : '暂停'}
            </button>
          ) : (
            <button type="button" className="orchestra-primary" disabled={busy} onClick={() => runTeam()}>
              <Play size={14} /> {paused ? '继续' : started ? '继续运行' : '运行团队'}
            </button>
          )}
        </div>
      </div>

      {panel === 'budget' && (
        <form className="orchestra-team-panel" onSubmit={(e) => { e.preventDefault(); act(async () => { await call(`/projects/${project.id}/budget`, 'PUT', { budget_cny: Number(budget) }); setPanel(undefined); }); }}>
          <label>
            预算（元）
            <input type="number" inputMode="decimal" min={0.1} max={10000} step="any" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <p className="orchestra-small-note">
            已花 {yuan(spent)}{run?.tokens ? `（${run.tokens.input.toLocaleString()} 输入 + ${run.tokens.output.toLocaleString()} 输出 token）` : ''}；
            剩余节点预估约 {yuan(left)}。按保守价记账，实际扣费通常更低。
          </p>
          <div>
            <button type="submit" className="orchestra-primary" disabled={busy}>保存预算</button>
            <button type="button" className="orchestra-secondary" onClick={() => setPanel(undefined)}>取消</button>
          </div>
        </form>
      )}
      {panel === 'confirm' && (
        <div className="orchestra-team-panel" role="alertdialog">
          <p>剩余节点预估约 {yuan(left)}，超过了剩余预算 {yuan(Math.max(0, project.budget_cny - spent))}。预算用完时团队会自动暂停，提高预算后可以继续。</p>
          <div>
            <button type="button" className="orchestra-primary" disabled={busy} onClick={() => runTeam(true)}>仍然运行</button>
            <button type="button" className="orchestra-secondary" onClick={() => setPanel('budget')}>调整预算</button>
            <button type="button" className="orchestra-secondary" onClick={() => setPanel(undefined)}>取消</button>
          </div>
        </div>
      )}
      {notice && (
        <p className="orchestra-team-warning orchestra-team-pad" role="alert">
          {notice} <button type="button" onClick={() => setNotice('')}>知道了</button>
        </p>
      )}
      {run?.error_code && !active && (
        <p className="orchestra-team-warning orchestra-team-pad">
          {describeError(run.error_code)}
          {run.error_code === 'budget_exhausted' && <button type="button" onClick={() => setPanel('budget')}>提高预算</button>}
        </p>
      )}

      <div className="orchestra-team-body">
        <TeamCanvas
          plan={plan}
          run={run}
          selected={selected}
          current={point.id}
          focus={focus}
          onSelect={setSelected}
          onChange={(next) => { setNotice(''); setDraft(next); }}
          onRefuse={setNotice}
        />
        {log && <WorkLog plan={plan} run={run} taskId={log} all={files} onOpen={setPreview} onClose={() => setLog(undefined)} />}
        {chat && <NodeChat project={project.id} plan={plan} run={run} taskId={chat} onClose={() => setChat(undefined)} />}
        <div className="orchestra-team-side">
          {selected && plan.tasks.some((t) => t.id === selected) ? (
            <Inspector
              project={project.id}
              plan={plan}
              run={run}
              selected={selected}
              estimate={project.estimate}
              busy={busy}
              files={files}
              onChange={setDraft}
              onSelect={setSelected}
              onAction={(action, task) => control(action, task)}
              onLog={openLog}
              onChat={(id) => act(async () => { await save(); openChat(id); })}
              onOpen={setPreview}
              onFilesChanged={() => act(async () => undefined)}
            />
          ) : (
            <>
              <section className="orchestra-team-inspector" aria-label="交付">
                <header><h3>交付</h3></header>
                {allDone ? (
                  <Deliverables project={project.id} workspace={project.workspace_name} files={deliverables} all={files} onOpen={setPreview} />
                ) : (
                  <p className="orchestra-small-note">全部节点完成后，最终交付会列在这里。中间文件在各节点的「工作记录」里。</p>
                )}
              </section>
              {project.estimate && (
                <section className="orchestra-team-inspector" aria-label="预估花费">
                  <header><h3>预估花费 · {yuan(project.estimate.total_cny)}</h3></header>
                  <ul className="orchestra-team-costs">
                    {plan.tasks.map((t) => {
                      const cost = project.estimate!.tasks.find((c) => c.id === t.id);
                      return (
                        <li key={t.id}>
                          <button type="button" onClick={() => setSelected(t.id)}>{t.title}</button>
                          <span>{cost ? yuan(cost.cost_cny) : '保存后估算'}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="orchestra-small-note">按节点工作量和审查轮数估算，按保守价计；实际以运行记账为准。</p>
                </section>
              )}
              <Roster plan={plan} editable onChange={setDraft} />
              <section className="orchestra-team-inspector orchestra-team-manage">
                {panel === 'redesign' ? (
                  <form onSubmit={(e) => { e.preventDefault(); act(async () => { await call(`/projects/${project.id}/design`, 'POST', { instructions: instructions.trim() }); setPanel(undefined); setInstructions(''); }); }}>
                    <label>
                      告诉总指挥要怎么改
                      <textarea rows={4} maxLength={4000} value={instructions} placeholder="例如：加一个测试节点；去掉音效；把网页拆成首页和详情页。" onChange={(e) => setInstructions(e.target.value)} />
                    </label>
                    <p className="orchestra-small-note">已完成的节点会原样保留，总指挥只重新设计其余部分。</p>
                    <div>
                      <button type="submit" className="orchestra-primary" disabled={busy || !instructions.trim() || active}>重新设计</button>
                      <button type="button" className="orchestra-secondary" onClick={() => setPanel(undefined)}>取消</button>
                    </div>
                  </form>
                ) : panel === 'delete' ? (
                  <div>
                    <button type="button" className="orchestra-secondary orchestra-team-danger" disabled={busy || active} onClick={() => act(async () => { await call(`/projects/${project.id}`, 'DELETE'); onDeleted(); })}>
                      <Trash2 size={14} /> 确认删除团队和所有成果
                    </button>
                    <button type="button" className="orchestra-secondary" onClick={() => setPanel(undefined)}>取消</button>
                  </div>
                ) : (
                  <div>
                    <button type="button" className="orchestra-secondary" disabled={active} onClick={() => setPanel('redesign')}>
                      <RefreshCw size={14} /> 让总指挥重新设计
                    </button>
                    <button type="button" className="orchestra-secondary" disabled={active} onClick={() => setPanel('delete')}>
                      <Trash2 size={14} /> 删除团队
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      <FilePreview file={preview} all={files} onClose={() => setPreview(undefined)} />
    </div>
  );
}
