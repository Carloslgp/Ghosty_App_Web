import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.base.js';

// Os testes de integração sobem o NestJS, que depende dos metadados de decorators para validar os DTOs.
// O transformador padrão do Vitest não gera esses metadados; o SWC gera.
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      swc.vite({
        jsc: {
          target: 'es2022',
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
        module: { type: 'es6' },
      }),
    ],
    test: {},
  }),
);
