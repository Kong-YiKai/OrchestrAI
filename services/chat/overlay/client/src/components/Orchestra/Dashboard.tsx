import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  Cpu,
  Globe,
  Hash,
  Menu,
  MessageSquare,
  Network,
  Plus,
  Sparkles,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react';
import { mainTextareaId } from '~/common';
import { useAuthContext } from '~/hooks';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { useConversationsInfiniteQuery } from '~/data-provider';
import { useTeamApi, yuan } from './teams/api';
import type { Project } from './teams/api';
import { useWorkbench } from './Workbench';

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : String(n);

const ago = (at?: string) => {
  if (!at) return '';
  const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
};

type Status = { label: string; tone: 'live' | 'ready' | 'done' | 'warn' | 'idle' };
function statusOf(team: Project): Status {
  const run = team.latest_run;
  if (team.status === 'planning') return { label: '组建中', tone: 'live' };
  if (team.status === 'failed') return { label: '组建失败', tone: 'warn' };
  if (!run) return { label: '待运行', tone: 'ready' };
  if (run.active > 0) return { label: '运行中', tone: 'live' };
  if (run.failed > 0) return { label: '有失败', tone: 'warn' };
  if (run.status === 'completed') return { label: '已完成', tone: 'done' };
  return { label: '已暂停', tone: 'idle' };
}

/**
 * The workbench overview: a hero to start something new, live numbers about the user's agent
 * teams, the teams themselves and recent conversations. Every figure comes from the user's own
 * data; nothing is a placeholder.
 */
export default function Dashboard() {
  const call = useTeamApi();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthContext();
  const { setView } = useWorkbench();
  const { setSidebarOpen } = useSidebarToggle();
  const teams = useQuery<{ projects: Project[] }>(
    ['orchestra-teams', user?.id],
    ({ signal }) => call('/projects', 'GET', undefined, undefined, signal),
    {
      retry: false,
      refetchInterval: (data) => (data?.projects.some((p) => statusOf(p).tone === 'live') ? 5000 : false),
    },
  );
  const history = useConversationsInfiniteQuery(
    { sortBy: 'updatedAt', sortDirection: 'desc' },
    { enabled: isAuthenticated },
  );
  const projects = useMemo(() => teams.data?.projects ?? [], [teams.data]);
  const conversations = (history.data?.pages[0]?.conversations ?? []).slice(0, 5);
  const totals = useMemo(() => {
    let live = 0, spent = 0, budget = 0, tokens = 0, nodes = 0;
    for (const p of projects) {
      if (statusOf(p).tone === 'live') live += 1;
      spent += p.latest_run?.spent_cny ?? 0;
      budget += p.budget_cny;
      tokens += (p.latest_run?.tokens?.input ?? 0) + (p.latest_run?.tokens?.output ?? 0);
      nodes += p.task_count ?? 0;
    }
    return { live, spent, budget, tokens, nodes };
  }, [projects]);

  const startChat = (text = '') => {
    navigate('/c/new');
    window.setTimeout(() => {
      const box = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      if (box && text) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        setter?.call(box, text);
        box.dispatchEvent(new Event('input', { bubbles: true }));
      }
      box?.focus();
    }, 300);
  };
  const [, setParams] = useSearchParams();
  const openTeam = (id: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('view', 'canvas');
      next.set('team', id);
      return next;
    });
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const guest = (user as { provider?: string } | undefined)?.provider === 'guest';

  return (
    <div className="orchestra-dashboard">
      <div className="orchestra-dash-top">
        <button
          id="open-sidebar-button"
          type="button"
          className="orchestra-icon-button orchestra-mobile-menu"
          aria-label="打开任务导航"
          aria-controls="chat-history-nav"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
        <div className="orchestra-dash-hello">
          <p className="orchestra-eyebrow">DASHBOARD / 总览</p>
          <h1>{greeting}，{user?.name || '欢迎回来'}</h1>
        </div>
        <span className="orchestra-dash-chip" title="团队最近一次运行用掉的 token">
          <Sparkles size={15} /> {compact(totals.tokens)} Tokens
        </span>
      </div>

      <section className="orchestra-dash-hero">
        <div className="orchestra-dash-hero-copy">
          <span className="orchestra-dash-badge">
            <Zap size={14} /> 总指挥在线 · {guest ? '游客体验' : '你的工作台'}
          </span>
          <h2>
            把一个想法，<br />
            <em>交给一支 AI 团队。</em>
          </h2>
          <p>
            说出想做的东西，助手会一步步问清需求；确认后总指挥自动组建团队、画出工作流，并行完成、互相审查，每一步都有记录。
          </p>
          <div className="orchestra-dash-cta">
            <button type="button" className="orchestra-glow-button" onClick={() => startChat('我想做一个')}>
              <Plus size={18} /> 描述需求，开始澄清
            </button>
            <button type="button" className="orchestra-ghost-button" onClick={() => setView('canvas')}>
              <Workflow size={17} /> 打开工作流画布
            </button>
          </div>
        </div>
        <div className="orchestra-dash-orbit" aria-hidden="true">
          <span className="orchestra-dash-ring" />
          <span className="orchestra-dash-core" />
          <span className="orchestra-dash-satellite" data-at="1"><Bot size={20} /></span>
          <span className="orchestra-dash-satellite" data-at="2"><Zap size={20} /></span>
          <span className="orchestra-dash-satellite" data-at="3"><Brain size={20} /></span>
        </div>
      </section>

      <section className="orchestra-dash-stats" aria-label="数据">
        <Stat tone="yellow" icon={<Cpu size={22} />} label="智能体团队" value={String(projects.length)} note={`${totals.nodes} 个节点`} />
        <Stat tone="slate" icon={<Network size={22} />} label="正在工作" value={String(totals.live)} note={totals.live ? '实时同步中' : '暂无运行'} live={totals.live > 0} />
        <Stat tone="mint" icon={<Wallet size={22} />} label="团队花费" value={yuan(totals.spent)} note={`预算合计 ${yuan(totals.budget)}`} />
        <Stat tone="peach" icon={<Activity size={22} />} label="Token 用量" value={compact(totals.tokens)} note="按最近一次运行统计" />
      </section>

      <div className="orchestra-dash-grid">
        <section className="orchestra-dash-panel">
          <header>
            <h3>智能体团队</h3>
            <button type="button" onClick={() => setView('canvas')}>
              全部 <ArrowRight size={14} />
            </button>
          </header>
          {teams.isLoading && <p className="orchestra-small-note">正在读取团队…</p>}
          {teams.isError && <p className="orchestra-small-note">团队服务暂时不可用。</p>}
          {!teams.isLoading && !teams.isError && projects.length === 0 && (
            <div className="orchestra-dash-empty">
              <p>还没有团队。在对话里说出想做的东西，确认需求后会自动组建第一支团队。</p>
              <button type="button" className="orchestra-dark-pill" onClick={() => startChat('我想做一个')}>
                <MessageSquare size={16} /> 去对话里描述
              </button>
            </div>
          )}
          <div className="orchestra-dash-teams">
            {projects.slice(0, 4).map((team) => {
              const status = statusOf(team);
              const total = team.task_count ?? 0;
              const done = team.latest_run?.completed ?? 0;
              return (
                <article key={team.id} className="orchestra-dash-team">
                  <div className="orchestra-dash-team-head">
                    <span className="orchestra-dash-hash" aria-hidden="true"><Hash size={18} /></span>
                    <div>
                      <h4 title={team.workspace_name}>{team.workspace_name}</h4>
                      <p>{ago(team.latest_run?.updated_at ?? team.updated_at)}</p>
                    </div>
                    <span className="orchestra-dash-pill" data-tone={status.tone}>{status.label}</span>
                  </div>
                  <p className="orchestra-dash-goal">{team.goal}</p>
                  <div className="orchestra-dash-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
                    <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                  </div>
                  <footer>
                    <span>{done}/{total} 节点 · {yuan(team.latest_run?.spent_cny ?? 0)} / {yuan(team.budget_cny)}</span>
                    <span>
                      {team.conversation_id && (
                        <button type="button" onClick={() => navigate(`/c/${team.conversation_id}`)}>需求对话</button>
                      )}
                      <button type="button" className="is-strong" onClick={() => openTeam(team.id)}>打开工作流</button>
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        <div className="orchestra-dash-side">
          <section className="orchestra-dash-panel">
            <header>
              <h3>最近对话</h3>
            </header>
            {conversations.length === 0 && <p className="orchestra-small-note">还没有对话。</p>}
            <ul className="orchestra-dash-convos">
              {conversations.map((c) => (
                <li key={c.conversationId}>
                  <button type="button" onClick={() => navigate(`/c/${c.conversationId}`)}>
                    <MessageSquare size={16} />
                    <span>{c.title || '新对话'}</span>
                    <time>{ago(c.updatedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <QuickCard tone="amber" icon={<Workflow size={20} />} title="可视化工作流" text="拖拽节点、连线、选模型，单独运行或暂停任意节点。" onClick={() => setView('canvas')} />
          <QuickCard tone="mint" icon={<Globe size={20} />} title="联网研究" text="检索、读取并引用公开网页，结果可以带入对话。" onClick={() => setView('research')} />
        </div>
      </div>
    </div>
  );
}

function Stat(props: { tone: string; icon: ReactNode; label: string; value: string; note: string; live?: boolean }) {
  return (
    <div className="orchestra-dash-stat" data-tone={props.tone}>
      <div>
        <p>{props.label}</p>
        <strong>{props.value}</strong>
      </div>
      <span className="orchestra-dash-stat-icon" aria-hidden="true">{props.icon}</span>
      <footer data-live={props.live || undefined}>{props.note}</footer>
    </div>
  );
}

function QuickCard(props: { tone: string; icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" className="orchestra-dash-quick" data-tone={props.tone} onClick={props.onClick}>
      <span aria-hidden="true">{props.icon}</span>
      <strong>{props.title}</strong>
      <p>{props.text}</p>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}
