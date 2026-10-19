import { useLocalize } from '~/hooks';
import { useEffect, useState } from 'react';
import { MessageSquare, Workflow, Plus, Search, X, LogOut, Globe } from 'lucide-react';
import { useMediaQuery, ThemeSelector } from '@librechat/client';
import { SidebarChatProvider } from '~/components/UnifiedSidebar/UnifiedSidebar';
import {
  MOBILE_DRAWER_ID,
  MOBILE_DRAWER_WIDTH,
  MOBILE_DRAWER_TRANSITION,
  DRAWER_Z_INDEX,
  DRAWER_UNPAINTED,
} from '~/components/UnifiedSidebar/constants';
import Conversation from '~/components/Conversations/Convo';
import useSidebarState from '~/hooks/Nav/useSidebarState';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import useNewChat from '~/hooks/Chat/useNewChat';
import { useAuthContext } from '~/hooks';
import { useConversationsInfiniteQuery, useTitleGeneration } from '~/data-provider';
import { useWorkbench } from './Workbench';
import Brand from './Brand';

function Navigation() {
  const localize = useLocalize();
  const { user, logout, isAuthenticated } = useAuthContext();
  const { isSmallScreen, expanded } = useSidebarState();
  const { setSidebarOpen } = useSidebarToggle();
  const { view, setView } = useWorkbench();
  const [search, setSearch] = useState('');
  const close = () => {
    if (isSmallScreen) setSidebarOpen(false);
  };
  const { handleNewChatClick } = useNewChat({ onNewChat: close });
  useTitleGeneration(isAuthenticated);
  const history = useConversationsInfiniteQuery(
    { sortBy: 'updatedAt', sortDirection: 'desc' },
    { enabled: isAuthenticated },
  );
  const loadedConversations = history.data?.pages.flatMap((page) => page.conversations) ?? [];
  const titleFilter = search.trim().toLocaleLowerCase();
  const conversations = loadedConversations.filter((conversation) =>
    (conversation.title ?? '').toLocaleLowerCase().includes(titleFilter),
  );
  useEffect(() => {
    if (isSmallScreen && expanded) document.getElementById('close-sidebar-button')?.focus();
  }, [isSmallScreen, expanded]);
  const links = [
    { view: 'chat', icon: MessageSquare, label: '对话工作台' },
    { view: 'research', icon: Globe, label: '联网研究' },
    { view: 'canvas', icon: Workflow, label: '工作流画布' },
  ] as const;
  return (
    <nav
      id="chat-history-nav"
      className="orchestra-sidebar"
      aria-label="任务导航"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isSmallScreen && !e.defaultPrevented) {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="orchestra-sidebar-brand">
        <a href="/c/new" onClick={handleNewChatClick} aria-label="OrchestrAI 工作台">
          <Brand />
        </a>
        {isSmallScreen && (
          <button
            id="close-sidebar-button"
            type="button"
            className="orchestra-icon-button"
            aria-label="关闭任务导航"
            onClick={close}
          >
            <X size={20} />
          </button>
        )}
      </div>
      <a
        href="/c/new"
        onClick={handleNewChatClick}
        className="orchestra-primary orchestra-new-task"
      >
        <Plus size={17} />
        {localize('com_orchestra_new_task')}
      </a>
      <label className="orchestra-task-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">{localize('com_orchestra_filter_task_titles')}</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={localize('com_orchestra_filter_task_titles')}
          aria-describedby="task-filter-scope"
        />
      </label>
      <p id="task-filter-scope" className="orchestra-small-note">
        {localize('com_orchestra_filter_scope')}
      </p>
      <p className="orchestra-nav-label">{localize('com_orchestra_workspace')}</p>
      <div className="orchestra-workspace-links">
        {links.map(({ view: key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            aria-current={
              view === key || (key === 'chat' && view === 'context') ? 'page' : undefined
            }
            onClick={() => {
              setView(key);
              close();
            }}
          >
            <Icon size={18} strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>
      <div className="orchestra-history">
        <div className="orchestra-history-heading">
          <p className="orchestra-nav-label">{titleFilter ? '筛选结果' : '最近任务'}</p>
          {history.isFetching && (
            <span role="status" className="orchestra-small-note">
              {localize('com_orchestra_updating')}
            </span>
          )}
        </div>
        {history.isLoading && (
          <p role="status" className="orchestra-small-note">
            {localize('com_orchestra_loading_tasks')}
          </p>
        )}
        {history.isError && (
          <div role="alert" className="orchestra-small-note">
            {localize('com_orchestra_tasks_error')}
            <button type="button" onClick={() => void history.refetch()}>
              {localize('com_orchestra_retry')}
            </button>
          </div>
        )}
        {!history.isLoading && !history.isError && conversations.length === 0 && (
          <p className="orchestra-small-note">
            {titleFilter
              ? '已加载的任务中没有匹配标题。'
              : '从新建任务开始，你的工作会保存在这里。'}
          </p>
        )}
        <div className="orchestra-history-list">
          {conversations.map((conversation) => (
            <Conversation
              key={conversation.conversationId}
              conversation={conversation}
              retainView={() => undefined}
              toggleNav={(afterSlide) => {
                if (isSmallScreen) setSidebarOpen(false, afterSlide);
                else afterSlide?.();
              }}
            />
          ))}
        </div>
        {history.hasNextPage && (
          <button
            type="button"
            className="orchestra-more"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? '正在读取…' : '查看更多任务'}
          </button>
        )}
      </div>
      <div className="orchestra-account">
        <span className="orchestra-account-avatar" aria-hidden="true">
          {user?.name?.slice(0, 1) || 'O'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate">{user?.name || '我的工作台'}</p>
          <span>{localize('com_orchestra_personal_workspace')}</span>
        </div>
        <ThemeSelector returnThemeOnly />
        <button
          type="button"
          className="orchestra-icon-button"
          aria-label="退出登录"
          onClick={() => logout('/login')}
        >
          <LogOut size={17} />
        </button>
      </div>
    </nav>
  );
}

export default function Sidebar({ isSliding }: { isSliding: boolean }) {
  const { isSmallScreen, expanded } = useSidebarState();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  return (
    <div
      key={isSmallScreen ? 'mobile' : 'desktop'}
      id={isSmallScreen ? MOBILE_DRAWER_ID : undefined}
      className={
        isSmallScreen
          ? `fixed inset-y-0 left-0 flex touch-pan-y touch-pinch-zoom ${expanded ? 'translate-x-0' : '-translate-x-full'}`
          : 'orchestra-sidebar-column'
      }
      style={
        isSmallScreen
          ? {
              width: MOBILE_DRAWER_WIDTH,
              transition: reducedMotion ? undefined : MOBILE_DRAWER_TRANSITION,
              zIndex: DRAWER_Z_INDEX,
              visibility: expanded || isSliding ? undefined : DRAWER_UNPAINTED,
            }
          : undefined
      }
      inert={isSmallScreen && !expanded ? '' : undefined}
    >
      <SidebarChatProvider>
        <Navigation />
      </SidebarChatProvider>
    </div>
  );
}
