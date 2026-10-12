// Test-only deterministic engine; this directory is not copied into the image.
import { createService } from '../src/service.mjs';
const db=new URL(process.env.DATABASE_URL);db.pathname='/research_fixture';
const redis=new URL(process.env.REDIS_URL);
const service=await createService({databaseUrl:db.href,secret:process.env.RESEARCH_DELEGATION_SECRET,
  redis:{host:redis.hostname,port:Number(redis.port||6379),password:decodeURIComponent(redis.password),db:2}},
async(run,settings,progress,cancelled)=>{
  await progress('reading',{sources:[{id:'S1',url:'https://example.com/evidence',title:'Fixed evidence',state:'read',
    evidence:'固定夹具验证持久化和权限，不代表真实 provider 验收。',fetched_at:new Date().toISOString()}]});
  if(run.query==='interrupt' || run.query==='cancel') {
    for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(await cancelled())throw new Error('cancelled');}
  }
  return {status:'completed',error:null,sources:[],claims:[],fixture:true};
});
service.server.listen(8092,'127.0.0.1');
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await service.close();process.exit(0);});
