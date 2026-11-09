#!/usr/bin/env node
// Copia a configuração compartilhada da raiz para cada projeto, ou confere se as cópias estão iguais.
//
//   node config/sync.mjs                  copia para todos os projetos
//   node config/sync.mjs ghosty-bff       copia só para os projetos indicados
//   node config/sync.mjs --check          confere todos (usado no CI) e falha se houver diferença
//   node config/sync.mjs --check ghosty-bff
//
// Cada projeto guarda uma cópia (e não uma referência à raiz) para continuar independente:
// o build do Docker usa a pasta do projeto como contexto, e um projeto pode virar repositório próprio.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Grupos de arquivos: [original na raiz, destino dentro do projeto]. */
const GROUPS = {
  format: [
    ['.prettierrc.json', '.prettierrc.json'],
    ['config/prettierignore', '.prettierignore'],
  ],
  typescript: [
    ['config/tsconfig.base.json', 'tsconfig.base.json'],
    ['config/eslint.base.mjs', 'eslint.base.mjs'],
  ],
  node: [
    ['config/vitest.base.ts', 'vitest.base.ts'],
    ['config/architecture/architecture.rules.ts', 'test/architecture/architecture.rules.ts'],
  ],
  // Código comum da camada api dos serviços NestJS (Problem Details, logs, /health, Swagger).
  nest: [
    'bootstrap.ts',
    'correlation-id.ts',
    'health.controller.ts',
    'logger.ts',
    'openapi.ts',
    'platform.module.ts',
    'problem-details.ts',
    'public.decorator.ts',
  ].map((file) => [`config/nest/platform/${file}`, `src/api/platform/${file}`]),
  // JSON Schemas dos eventos (AsyncAPI): quem publica e quem consome valida as mensagens com eles.
  events: [
    'alert-dispatched.v1.schema.json',
    'check-in-deadline-scheduled.v1.schema.json',
    'help-request-triggered.v1.schema.json',
  ]
    .map((file) => [`ghosty-docs/asyncapi/schemas/${file}`, `src/infrastructure/events/schemas/${file}`])
    .concat([['config/events/event-validator.ts', 'src/infrastructure/events/event-validator.ts']]),
  // Só nos microserviços chamados pelo BFF e pela Function (X-Internal-Key e X-User-Id).
  'nest-internal': ['internal-key.guard.ts', 'user-id.decorator.ts'].map((file) => [
    `config/nest/internal/${file}`,
    `src/api/platform/${file}`,
  ]),
};

/** Quais grupos cada projeto recebe. */
export const PROJECTS = {
  'ghosty-bff': ['format', 'typescript', 'node', 'nest'],
  'ghosty-notes-service': ['format', 'typescript', 'node', 'nest', 'nest-internal'],
  'ghosty-safety-service': ['format', 'typescript', 'node', 'nest', 'nest-internal', 'events'],
  'ghosty-functions': ['format', 'typescript', 'node', 'events'],
  'ghosty-web': ['format', 'typescript'],
  'ghosty-docs': ['format'],
};

const normalize = (text) => text.replace(/\r\n/g, '\n');

function filesFor(project) {
  return PROJECTS[project].flatMap((group) => GROUPS[group]);
}

function main(argv) {
  const check = argv.includes('--check');
  const requested = argv.filter((arg) => !arg.startsWith('--'));
  const unknown = requested.filter((name) => !(name in PROJECTS));
  if (unknown.length > 0) {
    console.error(`Projeto desconhecido: ${unknown.join(', ')}. Opções: ${Object.keys(PROJECTS).join(', ')}`);
    return 2;
  }
  const projects = requested.length > 0 ? requested : Object.keys(PROJECTS);
  const problems = [];
  let copied = 0;

  for (const project of projects) {
    for (const [source, target] of filesFor(project)) {
      const expected = normalize(readFileSync(path.join(repoRoot, source), 'utf8'));
      const destination = path.join(repoRoot, project, target);
      const current = existsSync(destination) ? normalize(readFileSync(destination, 'utf8')) : null;
      if (current === expected) continue;

      if (check) {
        problems.push(`${project}/${target} ${current === null ? 'não existe' : `difere de ${source}`}`);
      } else {
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, expected);
        copied += 1;
        console.log(`copiado: ${source} → ${project}/${target}`);
      }
    }
  }

  if (check) {
    if (problems.length > 0) {
      console.error('A configuração compartilhada está fora de sincronia:');
      for (const problem of problems) console.error(`  - ${problem}`);
      console.error(
        'Edite só o original em config/ (ou .prettierrc.json na raiz) e rode: node config/sync.mjs',
      );
      return 1;
    }
    console.log(`Configuração compartilhada em dia: ${projects.join(', ')}`);
    return 0;
  }

  console.log(copied === 0 ? 'Nada a copiar: tudo em dia.' : `${copied} arquivo(s) copiado(s).`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
