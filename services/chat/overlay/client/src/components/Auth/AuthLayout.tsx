import { useState } from 'react';
import { ThemeSelector, Spinner } from '@librechat/client';
import { MessageSquare, FileText, Workflow, ArrowRight } from 'lucide-react';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import Brand from '~/components/Orchestra/Brand';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a
              className="font-semibold text-accent-primary hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mx-auto sm:max-w-sm">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="orchestra-auth">
      <Banner />
      <div className="orchestra-auth-brand">
        <Brand />
      </div>
      <div className="orchestra-auth-theme">
        <ThemeSelector />
      </div>

      <main className="orchestra-auth-main">
        <section className="orchestra-auth-story" aria-label="OrchestrAI 工作台">
          <h2>
            {localize('com_orchestra_auth_title_first')}
            <br />
            {localize('com_orchestra_auth_title_last')}
          </h2>
          <p>
            {localize('com_orchestra_auth_description_first')}
            <br />
            {localize('com_orchestra_auth_description_last')}
          </p>
          <div className="orchestra-auth-steps" aria-hidden="true">
            <div>
              <MessageSquare size={24} strokeWidth={1.5} />
              {localize('com_orchestra_ideas')}
            </div>
            <ArrowRight size={16} />
            <div>
              <FileText size={24} strokeWidth={1.5} />
              {localize('com_orchestra_materials')}
            </div>
            <ArrowRight size={16} />
            <div>
              <Workflow size={24} strokeWidth={1.5} />
              {localize('com_orchestra_actions')}
            </div>
          </div>
        </section>
        <section className="orchestra-auth-card">
          {!hasStartupConfigError && !isFetching && header && (
            <h1 style={{ userSelect: 'none' }}>
              {pathname.includes('login') ? '欢迎回来' : header}
            </h1>
          )}
          {pathname.includes('login') && !isFetching && (
            <p>{localize('com_orchestra_auth_hint')}</p>
          )}
          <DisplayError />
          {isFetching && (
            <p role="status" className="flex items-center gap-3">
              <Spinner />
              {localize('com_orchestra_connecting')}
            </p>
          )}
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
          {pathname.includes('login') && !isFetching && <GuestEntry />}
        </section>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

const GUEST_ERRORS: Record<string, string> = {
  guest_rate_limited: '这台设备一小时内已经开了几次游客，请稍后再试或直接登录。',
  guest_capacity: '同时体验的游客太多了，请稍后再试。',
  guest_disabled: '游客体验暂未开放。',
};

/** "Skip login": a throwaway account; everything it does is deleted on sign-out or after 24 hours. */
function GuestEntry() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enter = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/orchestra/guest', { method: 'POST', credentials: 'include' });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(GUEST_ERRORS[value.message] ?? '暂时无法进入游客体验，请稍后再试。');
        setBusy(false);
        return;
      }
      // The session cookie is set; the app signs in from it on load.
      window.location.assign('/c/new');
    } catch {
      setError('网络连接失败，请稍后再试。');
      setBusy(false);
    }
  };
  return (
    <div className="orchestra-auth-guest">
      <div className="orchestra-auth-divider">
        <span>或者</span>
      </div>
      <button type="button" className="orchestra-dark-pill" onClick={enter} disabled={busy}>
        {busy ? <Spinner /> : '跳过登录，先体验一下'}
      </button>
      <p>游客不保存任何记录：退出或 24 小时后，对话、团队和文件全部清除。</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export default AuthLayout;
