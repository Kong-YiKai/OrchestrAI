import { existsSync } from 'node:fs';
import { join } from 'node:path';

const role = (id, name) => ({ id, name, description: `${name}职责`, instructions: `${name}的工作方法` });
const task = (id, title, roleId, file, depends_on = [], review = null) =>
  ({ id, title, role: roleId, depends_on, review, size: 'm', description: `TASK:${id} FILE:${file}` });
export const PLAN = {
  summary: '策划先出大纲，美术和程序并行，审批把关，最后汇总。',
  roles: [role('planner', '策划'), role('artist', '美术'), role('coder', '程序'), role('approver', '审批')],
  tasks: [
    task('outline', '大纲', 'planner', 'docs/outline.md'),
    task('style', '视觉样式', 'artist', 'site/style.css', ['outline']),
    task('page', '页面', 'coder', 'site/index.html', ['outline'], { mode: 'review', reviewers: ['approver'], max_rounds: 1 }),
    task('readme', '汇总', 'planner', 'README.md', ['style', 'page'], { mode: 'discussion', reviewers: ['artist', 'approver'], max_rounds: 1 }),
  ],
};

const text = messages => messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text).join('\n');

/**
 * Scripted stand-in for the gateway model: the commander answers with PLAN, workers
 * write the file named in their task, judges accept. Records parallelism and calls.
 */
export function fakeModel({ crashOn, slow = {}, usage = { input_tokens: 10, output_tokens: 5 } } = {}) {
  let active = 0, peak = 0, judged = 0, n = 0;
  const counts = new Map(), seen = new Set(), prompts = new Map();
  const reply = (content, stop = 'end_turn') => ({ id: `r${++n}`, model: 'test-model', stop_reason: stop,
    usage, content });
  const adapter = {
    name: 'fake',
    async chat(messages, options) {
      const system = options.systemPrompt ?? '';
      if (system.includes('总指挥')) return reply([{ type: 'text', text: JSON.stringify(PLAN) }]);
      const tools = (options.tools ?? []).map(t => t.name);
      const prompt = text(messages);
      if (!tools.includes('file_write')) {
        judged++;
        return reply([{ type: 'text', text: '{"accept": true, "critique": ""}' }]);
      }
      const ws = system.match(/团队共享工作目录是 (\S+?)。/)[1];
      const [, id, file] = prompt.match(/TASK:([a-z-]+) FILE:(\S+)/);
      for (const path of ['docs/outline.md']) if (existsSync(join(ws, path))) seen.add(path);
      if (messages.at(-1).content.some(b => b.type === 'tool_result')) {
        // A final node registers its file plus the page another node wrote.
        const delivered = messages.some(m => m.content.some(b => b.type === 'tool_use' && b.name === 'deliver'));
        if (tools.includes('deliver') && !delivered) {
          const paths = [file, ...(existsSync(join(ws, 'site/index.html')) ? ['site/index.html'] : [])];
          return reply([{ type: 'tool_use', id: `d${n}`, name: 'deliver', input: { paths } }], 'tool_use');
        }
        return reply([{ type: 'text', text: `已写入 ${file}` }]);
      }
      counts.set(id, (counts.get(id) ?? 0) + 1);
      prompts.set(id, prompt);
      if (id === crashOn) { await new Promise(r => setTimeout(r, 800)); process.exit(73); }
      active++; peak = Math.max(peak, active);
      // A slow task stays in flight until it is aborted (pause) or its delay passes.
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, slow[id] ?? 150);
        options.abortSignal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
      }).finally(() => { active--; });
      return reply([{ type: 'tool_use', id: `t${n}`, name: 'file_write', input: { path: join(ws, file), content: `<!-- ${file} -->\n` } }], 'tool_use');
    },
    async *stream(messages, options) {
      const r = await this.chat(messages, options);
      for (const b of r.content) if (b.type === 'text') yield { type: 'text', data: b.text };
      yield { type: 'done', data: r };
    },
  };
  return { adapter, overlap: () => peak, judged: () => judged, calls: id => counts.get(id) ?? 0, sawFile: path => seen.has(path),
    prompt: id => prompts.get(id) ?? '' };
}
