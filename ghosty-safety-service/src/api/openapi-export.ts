import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OPENAPI } from './openapi.config.js';
import { buildOpenApi, writeOpenApi } from './platform/openapi.js';

/** Gera o OpenAPI a partir do código, sem subir o servidor nem abrir o banco, em `dist/openapi.json`. */
async function main(): Promise<void> {
  const app = await NestFactory.create(
    AppModule.forRoot({
      internalApiKey: 'openapi-export',
      logLevel: 'silent',
      encryptionKey: Buffer.alloc(32).toString('base64'),
      database: { provider: 'sqlite', sqlitePath: ':memory:' },
      messaging: {
        enabled: false,
        connectionString: 'UseDevelopmentStorage=true',
        helpRequestsQueue: 'help-requests',
        checkInDeadlinesQueue: 'check-in-deadlines',
        alertDispatchesQueue: 'alert-dispatches',
      },
      safety: {
        codeLock: { maxAttempts: 5, lockMinutes: 15 },
        inviteTtlHours: 72,
        inviteBaseUrl: 'http://localhost:5173/c',
        telegramBotUsername: 'ghosty_dev_bot',
        timezone: 'America/Sao_Paulo',
      },
    }),
    { logger: false },
  );
  const file = process.argv[2] ?? 'dist/openapi.json';
  writeOpenApi(buildOpenApi(app, OPENAPI), file);
  await app.close();
  process.stdout.write(`OpenAPI gravado em ${file}\n`);
}

void main();
