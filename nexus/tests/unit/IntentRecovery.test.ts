import { InMemoryExecutionIntentStore } from '../../core/canonical/outcomes/ExecutionIntentStore.js';
import { intentRecoveryContract } from '../helpers/intentRecoveryContract.js';

intentRecoveryContract('in-memory execution recovery', () => new InMemoryExecutionIntentStore());
