// Inicialização comum dos serviços NestJS: logger, Swagger, desligamento gracioso e `.env` local.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { Logger } from 'nestjs-pino';
import { buildOpenApi, setupSwagger, type OpenApiOptions } from './openapi.js';

/** Na máquina local, lê o `.env` da pasta do projeto. No container, as variáveis vêm do ambiente. */
export function loadDotEnv(file = '.env'): void {
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Configuração aplicada tanto no `main.ts` quanto nos testes de integração. */
export function configureApp(app: INestApplication, openApi: OpenApiOptions): void {
  app.useLogger(app.get(Logger));
  (app as NestExpressApplication).disable('x-powered-by');
  app.enableShutdownHooks();
  setupSwagger(app, buildOpenApi(app, openApi));
}

/** Mostra o erro de configuração de forma legível e encerra, sem pilha nem valores das variáveis. */
export function exitWithConfigError(error: unknown): never {
  const text = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\nConfiguração inválida:\n${text}\n\n`);
  process.exit(1);
}
