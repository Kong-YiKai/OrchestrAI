import { OpenMultiAgent } from '@open-multi-agent/core';
import { checkPlan, LIMITS, planSchema } from './plan.mjs';
import { modelSettings } from './engine.mjs';

// The commander: reads the goal and drafts the team (roles are invented per goal) and
// the task graph. The user edits the result on the canvas before anything runs.
const PROMPT = `你是多智能体团队的总指挥。根据用户目标组建团队并画出工作流，只输出一个 JSON 对象，不要输出其它文字。

## 团队
- 角色按目标临时设计，不要套固定名单。可参考的分工：策划、美术、程序、音效、镜头、审批，也可以细分（如「前端程序」「数值策划」）或换成目标需要的其它角色。
- 角色数量 2～6 个为宜（最多 ${LIMITS.roles} 个）。每个角色写清职责（description）和具体工作方法、产出格式、质量标准（instructions）。

## 工作流
- 任务（最多 ${LIMITS.tasks} 个，通常 4～10 个）通过 depends_on 表达顺序：有依赖就是串行；互不依赖的任务会并行执行。
- 重要产出可以加 review：mode 为 "review" 时由 reviewers 挑错、作者修改（互审）；mode 为 "discussion" 时 reviewers 从各自专业角度讨论意见（讨论）。reviewers 不能包含任务自己的角色，审批类角色适合做 reviewer。review 会增加花费，只给关键任务加。
- 最后安排一个汇总任务，把成果整理成可直接使用的交付物，并写 README.md 说明每个文件的用途。

## 能力边界（非常重要）
- 团队只有一个文本模型，只能读写工作区里的文本文件，不能联网、不能运行代码、不能生成图片或音频。
- 所以交付物必须是文本格式：Markdown 文档、HTML/CSS/JavaScript、JSON、CSV、SVG 矢量图、Python 等源码。美术可以输出 SVG 或详细的视觉规范；音效可以输出音效设计文档或 Web Audio 代码；镜头可以输出分镜脚本。
- 单个文件尽量控制在 300 行以内，大的成果拆成多个文件。
- 文件路径相对于团队工作目录的根，例如 brief.md、site/index.html；不要再套一层以项目命名的外层文件夹（用户保存时会自动放进成果文件夹）。

## 输出格式
{"summary":"一句话说明团队如何完成目标","roles":[{"id":"planner","name":"策划","description":"…","instructions":"…"}],"tasks":[{"id":"outline","title":"…","description":"要做什么、写入哪些文件、验收标准","role":"planner","depends_on":[],"review":null}]}
- id 只用小写字母、数字和连字符，以字母开头；title 互不相同，不超过 80 字。
- review 为 null 或 {"mode":"review"|"discussion","reviewers":["角色id"],"max_rounds":1}。`;

export function createDesigner(settings, { adapter } = {}) {
  async function design(goal) {
    const model = modelSettings(settings, adapter);
    const oma = new OpenMultiAgent({ maxConcurrency: 1 });
    const agent = { name: 'commander', systemPrompt: PROMPT, tools: [], maxTurns: 2, maxTokens: 8192,
      callTimeoutMs: 240000, outputSchema: planSchema, ...model };
    let input = `目标：${goal}`;
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await oma.runAgent(agent, input);
      const checked = checkPlan(result.structured ?? parse(result.output));
      if (checked.ok) return { plan: checked.plan, tokens: result.tokenUsage };
      last = checked;
      input = `${input}\n\n上一次的方案不合格：${(checked.detail ?? [checked.error]).join('；')}。请修正后重新输出完整 JSON。\n上一次的输出：\n${String(result.output).slice(0, 12000)}`;
    }
    throw Object.assign(new Error('plan_generation_failed'), { code: 'plan_generation_failed', detail: last?.detail });
  }
  return { design };
}

function parse(text) {
  const raw = String(text ?? '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(raw); } catch { return null; }
}
