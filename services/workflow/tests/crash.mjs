import { Store } from '../src/store.mjs';
import { runtime } from '../src/runtime.mjs';
const store = new Store(process.env.DATABASE_URL);
const engine = runtime(process.env.DATABASE_URL,store,{ afterArtifact:async()=>process.exit(73) });
await engine.execute(process.argv[2],Number(process.argv[3]));
process.exit(1);
