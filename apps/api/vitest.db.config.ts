import base from '@slango.configs/vitest/default';
import { defineConfig, mergeConfig } from 'vitest/config';

// The API's data functions against pauseai_backoffice_test, which @backoffice/db's database tests rebuild and fill with
// the matrix fixtures first (turbo runs them before these). Most tests roll back what they write; the route and
// concurrency tests commit and put back what they changed, so files run one at a time.
export default mergeConfig(
  base,
  defineConfig({ test: { include: ['tests/**/*.spec.ts'], fileParallelism: false } }),
);
