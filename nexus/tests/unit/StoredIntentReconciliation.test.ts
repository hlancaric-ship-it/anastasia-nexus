import { InMemoryExecutionIntentStore } from '../../core/canonical/outcomes/ExecutionIntentStore.js';
import { storedReconciliationContract } from '../helpers/storedReconciliationContract.js';
storedReconciliationContract('stored reconciliation in memory', () => new InMemoryExecutionIntentStore());
