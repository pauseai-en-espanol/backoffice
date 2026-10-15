import base from '@slango.configs/vitest/default';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';

// The app's own import paths (tsconfig.json), so modules under test import as the app does.
export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
      },
    },
  }),
);
