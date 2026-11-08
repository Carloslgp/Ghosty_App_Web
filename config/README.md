# Configuração compartilhada

Os originais da configuração que todos os projetos usam. Cada projeto guarda uma **cópia idêntica**, e não uma referência para a raiz, por dois motivos:

- o build do Docker usa a pasta do projeto como contexto (`cd ghosty-bff && docker build .`), então nada fora dela entra na imagem;
- se um dia algum projeto virar um repositório próprio (`git subtree split`), ele continua funcionando sozinho.

Para a cópia não ficar diferente do original, o CI roda `node config/sync.mjs --check` e falha se algum arquivo divergir.

## Arquivos

| Original | Cópia no projeto | Projetos |
|---|---|---|
| `.prettierrc.json` (na raiz) | `.prettierrc.json` | todos |
| `config/prettierignore` | `.prettierignore` | todos |
| `config/tsconfig.base.json` | `tsconfig.base.json` | BFF, microserviços, Functions e web |
| `config/eslint.base.mjs` | `eslint.base.mjs` | BFF, microserviços, Functions e web |
| `config/vitest.base.ts` | `vitest.base.ts` | BFF, microserviços e Functions |
| `config/architecture/architecture.rules.ts` | `test/architecture/architecture.rules.ts` | BFF, microserviços e Functions |

## Como mudar

1. Edite **só o original**, aqui em `config/` (ou o `.prettierrc.json` da raiz).
2. Rode `node config/sync.mjs` na raiz. Ele copia para todos os projetos.
3. Faça o commit do original e das cópias juntos.

```bash
node config/sync.mjs                  # copia para todos
node config/sync.mjs ghosty-bff       # só para um projeto
node config/sync.mjs --check          # só confere (é o que o CI faz)
```

O script não tem dependências: basta o Node 24.

## Versões

| Ferramenta | Versão | Observação |
|---|---|---|
| TypeScript | 6.0.x | O `typescript-eslint` ainda não aceita o TypeScript 7 (pede `<6.1`) |
| ESLint | 10.x | Flat config, com `typescript-eslint` 8 e `eslint-config-prettier` |
| Prettier | 3.x | |
| Vitest | 5.x | `@vitest/coverage-v8` para a cobertura |
| archunit (ArchUnitTS) | 2.5.x | Exige `globals: true` no Vitest para o matcher `toPassAsync` |

## Regras de arquitetura

`describeArchitecture()` cria os testes abaixo, que rodam junto com o `npm test`:

1. `src/domain` não depende de `application`, `infrastructure` nem da camada de entrada, e não importa frameworks (`@nestjs/*`, `@azure/*`, `typeorm`, `mongodb`, `mssql`, `express`, `class-validator`…).
2. `src/application` não depende de `infrastructure` nem da entrada, e também não importa frameworks.
3. `src/infrastructure` não depende da camada de entrada.
4. A camada de entrada (`src/api` ou `src/functions`) só usa `infrastructure` nas raízes de composição (`app.module.ts` e os `*.module.ts` das features).
5. Um caso de uso não importa outro. Um caso de uso é uma pasta de `application/features` com um `*.handler.ts`; o que for compartilhado vai para `domain` ou para `application/ports`.
6. Não há dependências circulares em `src`.
7. Nomes: `*.handler.ts` só em `application/features`, `*.controller.ts` só em `src/api`, `*.repository.ts` só em `infrastructure` (implementação) ou em `application/ports` (porta).

Uma camada que ainda não tem arquivos aparece como teste pulado (`skipped`), e não como aprovado. Assim fica visível o que ainda não está sendo verificado.

## Modelo para um projeto Node (NestJS)

Os projetos usam ESM (`"type": "module"`), porque o NestJS 12 é ESM. Com `module: nodenext`, os imports relativos levam a extensão `.js` (`import { Note } from './note.entity.js'`).

`tsconfig.json` (typecheck de tudo, sem gerar arquivos):

```jsonc
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src", "test", "*.ts"]
}
```

`tsconfig.build.json` (o build que vai para a imagem):

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["**/*.spec.ts"]
}
```

`eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config';
import base from './eslint.base.mjs';

export default defineConfig([...base]);
```

`vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.base.js';

export default mergeConfig(base, defineConfig({ test: {} }));
```

`test/architecture/architecture.arch.spec.ts`:

```ts
import { describeArchitecture } from './architecture.rules.js';

describeArchitecture({
  entryLayer: 'api',
  compositionRoots: ['src/api/app.module.ts', 'src/api/**/*.module.ts'],
});
```

Na Function App, a entrada é `src/functions`, e cada função monta as próprias dependências:

```ts
describeArchitecture({ entryLayer: 'functions', compositionRoots: ['src/functions/**'] });
```

Scripts do `package.json` (o CI roda `lint`, `typecheck`, `test` e `build`, nessa ordem):

```json
{
  "type": "module",
  "scripts": {
    "lint": "eslint . && prettier --check .",
    "format": "prettier --write . && eslint . --fix",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:arch": "vitest run test/architecture",
    "test:cov": "vitest run --coverage",
    "build": "tsc -p tsconfig.build.json"
  }
}
```

Dependências de desenvolvimento:

```bash
npm i -D typescript@~6.0.3 @types/node@24 eslint@10 @eslint/js@10 typescript-eslint@8 globals \
  eslint-config-prettier@10 prettier@3 vitest@5 @vitest/coverage-v8@5 archunit@2
```

Cuidado com dois pontos no NestJS:

- O Vitest transforma o TypeScript sem gerar os metadados de decorators que a injeção de dependências do NestJS usa. Testes de unidade dos handlers não precisam disso (eles não usam o NestJS), mas testes de integração com `Test.createTestingModule` precisam de um plugin como o `unplugin-swc`.
- A regra `@typescript-eslint/consistent-type-imports` ficou de fora de propósito: transformar o import de uma classe injetada em `import type` quebra a injeção.

O `ghosty-web` usa o mesmo `tsconfig.base.json` e sobrescreve o que é de navegador (`lib` com `dom`, `module: esnext`, `moduleResolution: bundler`, `jsx: react-jsx` e `types`).
