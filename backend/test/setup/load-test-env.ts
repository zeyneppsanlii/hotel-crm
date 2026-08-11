import { config } from 'dotenv';
import { resolve } from 'path';

// Runs once per Jest worker BEFORE the app's ConfigModule reads the environment,
// so tests connect to hotel_crm_test instead of the dev database. `override`
// ensures the test values win over anything inherited from the shell.
config({ path: resolve(__dirname, '../../.env.test'), override: true });
