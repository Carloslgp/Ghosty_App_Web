import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv, type Env } from '../infrastructure/config/env.js';
import { appOptionsFrom } from './app-options.js';
import { AppModule } from './app.module.js';
import { OPENAPI } from './openapi.config.js';
import { configureApp, exitWithConfigError, loadDotEnv } from './platform/bootstrap.js';
import { configureHttp } from './shared/http-setup.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    exitWithConfigError(error);
  }

  const app = await NestFactory.create(AppModule.forRoot(appOptionsFrom(env)), { bufferLogs: true });
  configureHttp(app, { corsOrigins: env.CORS_ORIGINS, trustProxyHops: env.TRUST_PROXY_HOPS });
  configureApp(app, OPENAPI);
  await app.listen(env.PORT);
  const notes = [
    env.JWT_PRIVATE_KEY_PEM_B64 ? '' : 'chave JWT temporária',
    env.GATEWAY_SECRET ? '' : 'sem verificação do gateway',
  ].filter(Boolean);
  process.stdout.write(
    `BFF na porta ${env.PORT}${notes.length ? ` (${notes.join(', ')})` : ''} · Swagger em /docs\n`,
  );
}

void bootstrap();
