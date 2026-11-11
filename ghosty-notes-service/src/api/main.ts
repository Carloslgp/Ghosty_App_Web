import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv, type Env } from '../infrastructure/config/env.js';
import { startMemoryMongo, type MemoryMongo } from '../infrastructure/persistence/memory-mongo.js';
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

  // Sem URI do Atlas (ou com --memory), sobe um MongoDB em memória. Os dados somem ao parar, e o
  // próprio mongodb-memory-server encerra o processo do banco quando o serviço termina.
  let memory: MemoryMongo | undefined;
  const useMemory = process.argv.includes('--memory') || env.MONGODB_URI === '';
  if (useMemory) memory = await startMemoryMongo();

  const app = await NestFactory.create(
    AppModule.forRoot({
      mongoUri: memory?.uri ?? env.MONGODB_URI,
      mongoDb: env.MONGODB_DB,
      internalApiKey: env.INTERNAL_API_KEY,
      logLevel: env.LOG_LEVEL,
    }),
    { bufferLogs: true },
  );
  configureApp(app, withPublicServer(OPENAPI, env.OPENAPI_SERVER_URL, 'Azure Container Apps'));
  await app.listen(env.PORT);
  process.stdout.write(
    `notes-service na porta ${env.PORT}${useMemory ? ' (MongoDB em memória)' : ''} · Swagger em /docs\n`,
  );
}

void bootstrap();
