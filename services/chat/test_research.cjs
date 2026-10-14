const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const requireApi = createRequire(process.env.ORCHESTRA_TEST_SOURCE || '/app/package.json');
const jwt = requireApi('jsonwebtoken');
const { createOrchestraResearchTool, loadEphemeralAgent } = requireApi('@librechat/api');
const originalFetch = global.fetch;
const originalSecret = process.env.RESEARCH_DELEGATION_SECRET;
const originalURL = process.env.RESEARCH_API_URL;
process.env.RESEARCH_DELEGATION_SECRET = 'fixture-only-delegation-secret-123456789';
process.env.RESEARCH_API_URL = 'http://research:8091';
after(() => {
  global.fetch = originalFetch;
  if (originalSecret == null) delete process.env.RESEARCH_DELEGATION_SECRET; else process.env.RESEARCH_DELEGATION_SECRET = originalSecret;
  if (originalURL == null) delete process.env.RESEARCH_API_URL; else process.env.RESEARCH_API_URL = originalURL;
});
const id = '11111111-1111-4111-8111-111111111111';
const req = { user: { id: 'alice', tenantId: 'tenant-a' }, body: { responseMessageId: 'turn-1' } };
const call = { type: 'tool_call', name: 'web_search', id: 'call-1', args: { query: 'https://example.com/doc', user_id: 'bob' } };
const config = { metadata: { run_id: 'turn-1', thread_id: 'convo-1', user_id: 'alice' }, toolCall: { id: 'call-1', name: 'web_search', turn: 0 } };
const source = { id: 'S1', url: 'https://example.com/doc', title: 'Example', state: 'read', evidence: 'Only this actual fetched evidence.', fetched_at: '2026-10-13T00:00:00Z' };
function reply(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
function payload(message) { return JSON.parse(message.content.replace(/^Error processing tool: /, '').split('\n\n<source')[0]); }
function evidence(message, sourceId) { const m = message.content.match(new RegExp(`<source id="${sourceId}"[^>]*>\\n([\\s\\S]*?)\\n</source>`)); return m ? m[1] : null; }
function inspect(options) {
  const principal = jwt.verify(options.headers.Authorization.slice(7), process.env.RESEARCH_DELEGATION_SECRET, {
    algorithms: ['HS256'], issuer: 'orchestrai-chat', audience: 'orchestrai-research',
  });
  assert.equal(principal.sub, 'alice'); assert.equal(principal.tenant, 'tenant-a');
  assert.deepEqual(principal.scopes, [options.method === 'GET' ? 'research:read' : 'research:write']);
  assert.ok(principal.exp - principal.iat <= 60);
}
test('chat uses owned delegation, stable operation keys, real evidence and upstream attachments', async () => {
  const operations = []; let callbacks = 0; let requests = 0; let active = false;
  global.fetch = async (url, options) => {
    requests++; inspect(options);
    if (options.method === 'POST') {
      assert.equal(active, false, 'parallel model calls must be serialized'); active = true;
      operations.push(options.headers['Idempotency-Key']);
      const body = JSON.parse(options.body);
      assert.equal(body.query, call.args.query); assert.deepEqual(Object.keys(body), ['query']);
      return reply({ id, status: 'queued' }, 202);
    }
    assert.equal(url, `http://research:8091/queries/${id}`);
    active = false;
    return reply({ id, status: 'completed', result: { sources: [source], claims: [{ text: 'Evidence', source_id: 'S1', quote: 'actual fetched evidence' }] } });
  };
  const tool = createOrchestraResearchTool(req, undefined, (results) => { callbacks++; assert.equal(results.data.organic[0].link, source.url); });
  const results = await Promise.all([0, 1].map(i => tool.invoke({ ...call, id: 'call-'+i }, { ...config, toolCall: { ...config.toolCall, id: 'call-'+i } })));
  for (const result of results) {
    const value = payload(result);
    assert.equal(value.status, 'completed'); assert.equal(evidence(result, 'S1'), source.evidence); assert.equal(value.sources[0].truncated, false);
    assert.equal(result.artifact.web_search.organic[0].link, source.url);
  }
  assert.equal(callbacks, 2); assert.equal(operations[0], operations[1]);
  const limit = await tool.invoke(call, config);
  assert.equal(payload(limit).error, 'research_turn_limit'); assert.equal(requests, 4);
});
test('unread pages never become evidence; budget/busy errors stay failures', async () => {
  global.fetch = async () => reply({ id, status: 'partial', error: 'no_readable_sources', result: { sources: [{ ...source, state: 'unavailable', evidence: 'NOT BODY', snippet: 'UNREAD SUMMARY MUST NOT REACH MODEL' }], claims: [] } }, 202);
  const result = await createOrchestraResearchTool(req).invoke(call, config);
  assert.equal(evidence(result, 'S1'), null); assert.doesNotMatch(result.content, /NOT BODY|UNREAD SUMMARY/);
  assert.equal('snippet' in payload(result).sources[0], false);
  assert.equal(result.artifact.web_search.error, 'no_readable_sources');
  global.fetch = async () => reply({ error: 'research_busy' }, 429);
  const busy = await createOrchestraResearchTool(req).invoke(call, config);
  assert.equal(payload(busy).status, 'failed'); assert.equal(payload(busy).error, 'research_busy');
});
test('stopping a chat cancels the exact remote run without replaying search', async () => {
  const controller = new AbortController(); const paths = [];
  global.fetch = async (url, options) => {
    paths.push(url); inspect(options);
    if (url.endsWith('/cancel')) return reply({ id, status: 'cancelled' });
    controller.abort(); return reply({ id, status: 'queued' }, 202);
  };
  const result = await createOrchestraResearchTool(req, controller.signal).invoke(call, config);
  assert.equal(payload(result).error, 'research_cancelled');
  assert.deepEqual(paths, ['http://research:8091/queries', `http://research:8091/queries/${id}/cancel`]);
});
test('the first URL read uses the exact user link even when the model strips its scheme', async () => {
  let posted;
  global.fetch = async (_url, options) => { posted=JSON.parse(options.body).query; return reply({ id, status: 'partial', result: { sources: [], claims: [] } },202); };
  const url='https://zhuanlan.zhihu.com/p/150190166';
  const request={ ...req, body: { ...req.body, text: url+' 总结这个链接下的内容' } };
  await createOrchestraResearchTool(request).invoke({ ...call,args: { query:'zhuanlan.zhihu.com/p/150190166' } },config);
  assert.equal(posted,url);
  await createOrchestraResearchTool(request).invoke({ ...call,args: { query:'知乎文章总结' } },config);
  assert.equal(posted,url);
  const unicodeURL='https://example.com/明天';
  await createOrchestraResearchTool({ ...req,body:{ ...req.body,text:unicodeURL+' 总结这个链接' } }).invoke({ ...call,args:{ query:'example.com/明天' } },config);
  assert.equal(posted,unicodeURL);
});
test('relative dates become exact dates without polluting searches with clock/timezone keywords', async () => {
  let posted;
  global.fetch=async (_url,options)=>{posted=JSON.parse(options.body).query;return reply({ id,status:'partial',result:{sources:[],claims:[]} },202);};
  await createOrchestraResearchTool(req).invoke({ ...call,args:{query:'杭州 明天 天气预报'} },config);
  assert.match(posted,/杭州 \d{4}-\d{2}-\d{2} 天气预报/);assert.doesNotMatch(posted,/Asia|当前日期|明天/);
});
test('anonymous and disabled configuration cannot access the research transport', async () => {
  let count = 0; global.fetch = async () => { count++; throw new Error('must not call'); };
  const anonymous = await createOrchestraResearchTool({ body: req.body }).invoke(call, config);
  assert.equal(payload(anonymous).error, 'authentication_required');
  delete process.env.RESEARCH_API_URL;
  const missing = await createOrchestraResearchTool(req).invoke(call, config);
  assert.equal(payload(missing).error, 'research_not_configured'); assert.equal(count, 0);
  process.env.RESEARCH_API_URL = 'http://research:8091';
});
test('actual ephemeral chat loader respects the web switch and injects dated instructions only when enabled', async () => {
  for (const enabled of [false, true]) {
    const request = { user: req.user, body: { ephemeralAgent: { web_search: enabled } }, config: { endpoints: { custom: [{ name: 'DeepSeek', modelDisplayLabel: 'DeepSeek Flash' }] } } };
    const agent = await loadEphemeralAgent({ req: request, endpoint: 'DeepSeek', model_parameters: { model: 'deepseek-flash' } }, {});
    assert.equal(agent.tools.includes('web_search'), enabled);
    assert.equal((agent.instructions || '').includes('Asia/Shanghai'), enabled);
  }
});
test('a single long page reaches the model as readable text with an explicit truncation flag', async () => {
  const long = '第一行\n' + '云原生'.repeat(5000);
  global.fetch = async (_url, options) => options.method === 'POST' ? reply({ id, status: 'queued' }, 202)
    : reply({ id, status: 'completed', result: { sources: [{ ...source, evidence: long }], claims: [{ text: 'x', source_id: 'S1', quote: '第一行' }] } });
  const result = await createOrchestraResearchTool(req).invoke(call, config);
  const body = evidence(result, 'S1');
  assert.equal(body.length, 12000); assert.ok(body.startsWith('第一行\n'));
  assert.equal(payload(result).sources[0].truncated, true); assert.equal(payload(result).sources[0].evidence_chars, 12000);
});
test('a user-supplied link makes the first web_search call mandatory', async () => {
  const request = { user: req.user, body: { text: '总结 https://zhuanlan.zhihu.com/p/150190166。', ephemeralAgent: { web_search: true } }, config: { endpoints: { custom: [{ name: 'DeepSeek' }] } } };
  const agent = await loadEphemeralAgent({ req: request, endpoint: 'DeepSeek', model_parameters: { model: 'deepseek-flash' } }, {});
  assert.match(agent.instructions, /必须先调用 web_search，query 填写该完整链接/);
  assert.match(agent.instructions, /提供了链接：https:\/\/zhuanlan\.zhihu\.com\/p\/150190166。回答前/);
});
