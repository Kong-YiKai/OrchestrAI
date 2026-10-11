import { Annotation, StateGraph, START, END, interrupt, Command } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// R2's real deterministic workload. Arbitrary user-authored DAGs are delivered in R5.
export function runtime(url, store, { afterArtifact = async () => {} } = {}) {
  const saver = PostgresSaver.fromConnString(url);
  const State = Annotation.Root({ text: Annotation(), approved: Annotation(), result: Annotation() });
  const graph = new StateGraph(State)
    .addNode('validate', state => ({ text: state.text.trim() }))
    .addNode('approval', state => ({ approved: interrupt({ action:'persist-report', text:state.text, graph_version:'r2-proof-v1' }) }))
    .addNode('report', async (state, config) => {
      if (state.approved !== true) throw new Error('approval_required');
      const id = config.configurable.thread_id;
      const result = await store.report(id,`OrchestrAI report\n${state.text}\n`);
      await afterArtifact();
      return { result };
    })
    .addEdge(START,'validate').addEdge('validate','approval').addEdge('approval','report').addEdge('report',END)
    .compile({ checkpointer:saver });

  async function execute(id, version) {
    const lock = await store.pool.connect();
    try {
      await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[id]);
      const row = (await lock.query('SELECT * FROM runs WHERE id=$1',[id])).rows[0];
      if (!row || row.dispatch_version !== version || ['completed','cancelled','failed','waiting'].includes(row.status)) return;
      await lock.query("UPDATE runs SET status='running',updated_at=now() WHERE id=$1 AND status<>'cancelled'",[id]);
      const cfg = { durability:'sync', configurable:{ thread_id:id } };
      const before = await graph.getState(cfg);
      const paused = before.tasks?.some(t => t.interrupts?.length);
      const value = paused && row.decision === true ? new Command({ resume:true }) :
        before.createdAt ? null : { text:row.input.text };
      const output = await graph.invoke(value,cfg);
      const status = output.__interrupt__?.length ? 'waiting' : 'completed';
      await store.transaction(async c => {
        const update = await c.query("UPDATE runs SET status=$2,error_code=NULL,updated_at=now() WHERE id=$1 AND status<>'cancelled' RETURNING id",[id,status]);
        if (update.rowCount) await store.event(c,id,status,status === 'completed' ? output.result : { approval_version:row.approval_version });
      });
    } finally {
      try { await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[id]); }
      finally { lock.release(); }
    }
  }
  return { execute, close:() => saver.end() };
}
