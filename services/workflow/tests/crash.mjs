import { config } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { createEngine } from '../src/engine.mjs';
import { fakeModel } from './fake-model.mjs';

// Child process for the crash test: dies (exit 73) while the "page" node is in flight.
const store = new Store(config({ ...process.env, DELEGATION_SECRET: 'test-only-delegation-01234567890123456789' }).databaseUrl);
await createEngine(store, {}, { adapter: fakeModel({ crashOn: 'page' }).adapter }).execute(process.argv[2], Number(process.argv[3]));
process.exit(1);
