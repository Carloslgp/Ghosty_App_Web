// Configuração compartilhada do Vitest para os projetos Node (BFF, microserviços e Functions).
// O original fica em config/vitest.base.ts, na raiz do repositório. Cada projeto recebe uma
// cópia idêntica e a combina no próprio vitest.config.ts com `mergeConfig`.
// Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // O matcher `toPassAsync` do archunit se registra no `expect` global.
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    restoreMocks: true,
    // Os testes de arquitetura analisam o projeto inteiro e podem passar de 5 s na primeira execução.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/index.ts', 'src/application/ports/**'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});
