import { defineConfig } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import base from './eslint.base.mjs';

export default defineConfig([
  ...base,
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Os handlers de evento do React podem ser assíncronos.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  // O service worker roda no escopo do worker (self, caches), não no da página.
  {
    files: ['apps/*/public/sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  // O arquivo gerado a partir do contrato não é editado à mão.
  { ignores: ['packages/api-client/src/schema.d.ts'] },
]);
