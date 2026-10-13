import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rank, claimsFrom, readablePage, research } from '../src/engine.mjs';

test('Chinese BM25 selects relevant evidence and treats regex as text',()=>{
  const rows=rank('预算并发限额 [x]+',[
    {id:'S1',evidence:'今日天气晴朗，适合户外活动。'},
    {id:'S2',evidence:'预算限额在并发请求之前原子预留。预算并发控制防止超支。'},
  ]);
  assert.equal(rows[0].id,'S2');assert.ok(rows.every(s=>Number.isFinite(s.score)));
});
test('Citations must refer to a read page and an exact excerpt',()=>{
  const sources=[{id:'S1',state:'read',evidence:'服务使用持久状态恢复任务。'},
    {id:'S2',state:'unavailable',evidence:''}];
  assert.equal(claimsFrom({claims:[{text:'使用持久状态。',source_id:'S1',quote:'持久状态恢复任务'}]},sources).length,1);
  for(const claim of [{text:'未读取',source_id:'S2',quote:'搜索摘要'},
    {text:'编造',source_id:'S1',quote:'内存是唯一事实来源'},
    {text:'错误来源',source_id:'S9',quote:'持久状态恢复任务'}])
    assert.throws(()=>claimsFrom({claims:[claim]},sources));
});
const settings={gateway:'http://fixture',transportKey:'test-only',modelKey:'test-only'};
test('A fetched login/challenge shell is not a readable article',()=>{
  assert.equal(readablePage('https://www.xiaohongshu.com/explore','发现\n登录\n我\n沪ICP备备案号\n更多\n沪ICP备备案号'),false);
  assert.equal(readablePage('https://www.xiaohongshu.com/website-login/error?error_code=300012','上海公司注册信息'),false);
  assert.equal(readablePage('https://example.com/article','Verify you are human'),false);
  assert.equal(readablePage('https://example.com/article','文章正文。底部登录入口，网站备案信息。'),true);
});
const fixtureTool=(sources,failed=false)=>options=>({invoke:async()=>{
  if(sources.length) options.onSearchResults({data:{organic:sources}});
  return {artifact:{web_search:failed?{error:'429'}:{organic:sources}}};
}});
test('Unread/login-blocked sources never reach the model; direct links do not search',async()=>{
  let modelCalls=0;const phases=[];
  const result=await research({id:randomUUID(),query:'https://www.xiaohongshu.com/explore/example'},settings,
    async phase=>phases.push(phase),async()=>false,{
      createTool:fixtureTool([{link:'https://www.xiaohongshu.com/explore/example',title:'Restricted',snippet:'Unsafe search summary'}]),
      fetcher:async url=>{if(url.includes('chat/completions'))modelCalls++;return {ok:false};},
    });
  assert.equal(result.status,'partial');assert.equal(result.sources[0].state,'unavailable');
  assert.equal(result.sources[0].evidence,'');assert.deepEqual(result.claims,[]);assert.equal(modelCalls,0);
  assert.equal(phases[0],'reading');
});

test('Chinese instructions next to a URL are not sent as part of the address',async()=>{
  let invoked;
  await research({id:randomUUID(),query:'阅读 https://example.com/article，总结其中观点。'},settings,async()=>{},async()=>false,{
    createTool:()=>({invoke:async input=>{invoked=input.args.query;return {artifact:{web_search:{}}};}}),
    fetcher:async()=>{throw new Error('No sources should call no downstream provider');},
  });
  assert.equal(invoked,'https://example.com/article');
});
test('Partial extraction preserves sources and only answers from actual page text',async()=>{
  const phases=[];let modelCalls=0;
  const result=await research({id:randomUUID(),query:'如何防止预算超支'},settings,async phase=>phases.push(phase),async()=>false,{
    createTool:fixtureTool([{link:'https://example.com/budget',title:'Budget'}, {link:'https://example.org/blocked',title:'Blocked'}]),
    fetcher:async url=>{
      if(url.includes('/operations/')) return {ok:true,json:async()=>({credits:1,response:{results:[{url:'https://example.com/budget',raw_content:'预算限额采用原子预留，防止并发超支。'}]}})};
      modelCalls++;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[
        {text:'采用原子预留控制并发预算。',source_id:'S1',quote:'原子预留，防止并发超支'}]})}}]})};
    },
  });
  assert.equal(result.status,'partial');assert.equal(modelCalls,1);assert.equal(result.claims.length,1);
  assert.deepEqual(result.sources.map(s=>s.state),['read','unavailable']);
  assert.deepEqual(phases,['searching','reading','ranking','answering']);
});
test('Provider failure/cancellation prevents subsequent model calls',async()=>{
  let called=0;const dependencies={createTool:fixtureTool([],true),fetcher:async()=>{called++;throw new Error();}};
  const result=await research({id:randomUUID(),query:'失败样本'},settings,async()=>{},async()=>false,dependencies);
  assert.equal(result.status,'failed');assert.equal(called,0);
  await assert.rejects(research({id:randomUUID(),query:'取消样本'},settings,async()=>{},async()=>true,dependencies),/cancelled/);
  assert.equal(called,0);
});

test('Known direct-page extraction failure can use one verified reader result',async()=>{
  let readerCalls=0;
  const result=await research({id:randomUUID(),query:'https://example.com/article'},settings,async()=>{},async()=>false,{
    createTool:fixtureTool([{link:'https://example.com/article',title:'Article'}]),
    fetcher:async(url,options)=>{
      if(url.includes('/operations/'))return {ok:true,json:async()=>({credits:0,response:{results:[],failed_results:[{url:'https://example.com/article'}]}})};
      if(url.includes('/jina/read')) {readerCalls++;assert.deepEqual(JSON.parse(options.body),{url:'https://example.com/article'});return {ok:true,json:async()=>({results:[{url:'https://example.com/article',title:'Cloud native',raw_content:'云原生采用容器、微服务与持续交付。'}]})};}
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[{text:'采用容器与微服务。',source_id:'S1',quote:'容器、微服务与持续交付'}]})}}]})};
    },
  });
  assert.equal(readerCalls,1);assert.equal(result.status,'completed');assert.equal(result.sources[0].reader,'jina-anonymous');assert.equal(result.claims.length,1);
});
test('Unknown extraction does not start a reader; reader failure has no model or retry',async()=>{
  for(const known of [false,true]) {
    let readerCalls=0,modelCalls=0;
    const result=await research({id:randomUUID(),query:'https://example.com/article'},settings,async()=>{},async()=>false,{
      createTool:fixtureTool([{link:'https://example.com/article',title:'Article'}]),
      fetcher:async url=>{if(url.includes('/operations/'))return {ok:known,json:async()=>({credits:0,response:{results:[]}})};
        if(url.includes('/jina/read'))readerCalls++;else modelCalls++;return {ok:false};},
    });
    assert.equal(readerCalls,known?1:0);assert.equal(modelCalls,0);assert.equal(result.status,'partial');assert.equal(result.sources[0].evidence,'');
  }
});
