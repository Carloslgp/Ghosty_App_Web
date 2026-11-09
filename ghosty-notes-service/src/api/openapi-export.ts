import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OPENAPI } from './openapi.config.js';
import { buildOpenApi, writeOpenApi } from './platform/openapi.js';

/**
 * Gera o OpenAPI a partir do código, sem subir o servidor nem acessar o banco, e grava em
 * `dist/openapi.json` para comparar com o contrato em `ghosty-docs/contracts/`.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(
    AppModule.forRoot({
      mongoUri: 'mongodb://127.0.0.1:1/openapi-export',
      mongoDb: 'openapi-export',
      internalApiKey: 'openapi-export',
      logLevel: 'silent',
    }),
    { logger: false },
  );
  const file = process.argv[2] ?? 'dist/openapi.json';
  writeOpenApi(buildOpenApi(app, OPENAPI), file);
  await app.close();
  process.stdout.write(`OpenAPI gravado em ${file}\n`);
}

void main();
