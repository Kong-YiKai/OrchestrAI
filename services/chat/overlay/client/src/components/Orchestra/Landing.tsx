import { useLocalize } from '~/hooks';
import { ArrowRight, Search, FileText, Workflow } from 'lucide-react';
import { useChatFormContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { useWorkbench } from './Workbench';

export default function Landing() {
  const localize = useLocalize();
  const { setValue } = useChatFormContext();
  const { setView } = useWorkbench();
  const cards = [
    {
      icon: Search,
      title: '研究一个主题',
      description: '联网查找，并保留来源',
      action: () => setView('research'),
    },
    {
      icon: FileText,
      title: '读懂一份资料',
      description: '添加资料后，提炼重点与问题',
      action: () => {
        setValue('text', '请结合我添加的资料，提炼重点、关键问题和下一步建议。', {
          shouldValidate: true,
        });
        document.getElementById(mainTextareaId)?.focus();
      },
    },
    {
      icon: Workflow,
      title: '推进一项工作',
      description: '从目标开始，梳理行动计划',
      action: () => {
        setValue(
          'text',
          '我想推进一项工作，请先帮我明确目标和需要补充的信息，再一起梳理行动计划。',
          { shouldValidate: true },
        );
        document.getElementById(mainTextareaId)?.focus();
      },
    },
  ];
  return (
    <section className="orchestra-landing" aria-labelledby="landing-title">
      <div className="orchestra-landing-intro">
        <p className="orchestra-eyebrow">{localize('com_orchestra_landing_eyebrow')}</p>
        <h2 id="landing-title">
          {localize('com_orchestra_landing_title_first')}
          <br />
          {localize('com_orchestra_landing_title_last')}
        </h2>
        <p className="orchestra-landing-description">
          {localize('com_orchestra_landing_description')}
        </p>
      </div>
      <p className="orchestra-start-label">{localize('com_orchestra_choose_start')}</p>
      <div className="orchestra-start-grid">
        {cards.map(({ icon: Icon, title, description, action }) => (
          <button type="button" key={title} onClick={action} className="orchestra-start-card">
            <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
            <h3>{title}</h3>
            <p>{description}</p>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="orchestra-try">
        <span>{localize('com_orchestra_try_label')}</span>
        <p>{localize('com_orchestra_try_example')}</p>
      </div>
    </section>
  );
}
