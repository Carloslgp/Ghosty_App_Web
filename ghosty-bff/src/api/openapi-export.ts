import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadEnv } from '../infrastructure/config/env.js';
import { appOptionsFrom } from './app-options.js';
import { AppModule } from './app.module.js';
import { OPENAPI } from './openapi.config.js';
import { buildOpenApi, writeOpenApi } from './platform/openapi.js';

/** Gera o OpenAPI a partir do código, sem subir o servidor, em `dist/openapi.json`. */
async function main(): Promise<void> {
  const env = loadEnv({ INTERNAL_API_KEY: 'openapi-export', LOG_LEVEL: 'silent' });
  const app = await NestFactory.create(AppModule.forRoot(appOptionsFrom(env)), { logger: false });
  const file = process.argv[2] ?? 'dist/openapi.json';
  writeOpenApi(buildOpenApi(app, OPENAPI), file);
  await app.close();
  process.stdout.write(`OpenAPI gravado em ${file}\n`);
}

void main();
