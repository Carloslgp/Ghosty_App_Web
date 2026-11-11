// Swagger: interface em `/docs`, OpenAPI JSON em `/docs-json` e exportação para comparar com o contrato.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { applyDecorators, type INestApplication } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  DocumentBuilder,
  getSchemaPath,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ERROR_CATALOG, type ErrorCode } from './problem-details.js';

export class FieldErrorDto {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  message!: string;
}

export class ProblemDetailsDto {
  @ApiProperty({ example: '/errors/validation-failed' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: number;

  @ApiProperty({ enum: Object.keys(ERROR_CATALOG) })
  code!: string;

  @ApiPropertyOptional()
  detail?: string;

  @ApiPropertyOptional()
  instance?: string;

  @ApiPropertyOptional()
  correlationId?: string;

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldErrorDto[];
}

/** Documenta as respostas de erro de uma operação (`application/problem+json`). */
export function ApiProblems(...codes: ErrorCode[]) {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const { status } = ERROR_CATALOG[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...[...byStatus].map(([status, group]) =>
      ApiResponse({
        status,
        description: group.map((code) => `${code}: ${ERROR_CATALOG[code].title}`).join(' · '),
        content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetailsDto) } } },
      }),
    ),
  );
}

export interface OpenApiOptions {
  title: string;
  description: string;
  version: string;
  /** Acrescenta esquemas de segurança, servidores etc. */
  configure?: (builder: DocumentBuilder) => DocumentBuilder;
  /** Substitui os servidores do `configure` (na nuvem, o endereço público no lugar do localhost). */
  servers?: { url: string; description: string }[];
}

/**
 * Na nuvem, o Swagger mostra só o endereço público (`OPENAPI_SERVER_URL`), e não o localhost do contrato.
 * Sem a URL (máquina local e `openapi:export`), o documento continua igual ao contrato.
 */
export function withPublicServer(options: OpenApiOptions, url: string, description: string): OpenApiOptions {
  return url ? { ...options, servers: [{ url: url.replace(/\/+$/, ''), description }] } : options;
}

export function buildOpenApi(app: INestApplication, options: OpenApiOptions): OpenAPIObject {
  let builder = new DocumentBuilder()
    .setTitle(options.title)
    .setDescription(options.description)
    .setVersion(options.version);
  if (options.configure) builder = options.configure(builder);
  const config = builder.build();
  if (options.servers) config.servers = options.servers;
  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: document.info.title,
  });
}

/** Grava o OpenAPI gerado pelo código (usado no `npm run openapi:export`). */
export function writeOpenApi(document: OpenAPIObject, file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
}
