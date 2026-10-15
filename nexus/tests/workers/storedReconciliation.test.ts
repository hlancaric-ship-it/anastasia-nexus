import { env } from 'cloudflare:test';
import { D1ExecutionIntentStore } from '../../connectors/d1/D1ExecutionIntentStore.js';
import { storedReconciliationContract } from '../helpers/storedReconciliationContract.js';
storedReconciliationContract('stored reconciliation in real D1', () => new D1ExecutionIntentStore(env.DB));
