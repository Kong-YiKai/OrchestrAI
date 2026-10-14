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
        </section>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
