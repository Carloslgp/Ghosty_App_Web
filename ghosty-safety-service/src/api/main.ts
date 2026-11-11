import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv, type Env } from '../infrastructure/config/env.js';
import { appOptionsFrom } from './app-options.js';
import { AppModule } from './app.module.js';
import { OPENAPI } from './openapi.config.js';
import { configureApp, exitWithConfigError, loadDotEnv } from './platform/bootstrap.js';
import { withPublicServer } from './platform/openapi.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  let env: Env;
  try {
    env = loadEnv();
  } catch (error) {
    exitWithConfigError(error);
  }

  const app = await NestFactory.create(AppModule.forRoot(appOptionsFrom(env)), { bufferLogs: true });
  configureApp(app, withPublicServer(OPENAPI, env.OPENAPI_SERVER_URL, 'Azure Container Apps'));
  await app.listen(env.PORT);
  process.stdout.write(
    `safety-service na porta ${env.PORT} (${env.DB_PROVIDER}, filas ${env.MESSAGING_ENABLED ? 'ligadas' : 'desligadas'}) · Swagger em /docs\n`,
  );
}

void bootstrap();
