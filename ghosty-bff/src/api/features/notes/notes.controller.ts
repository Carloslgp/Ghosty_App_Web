import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { NotesProxyHandler } from '../../../application/features/notes/notes-proxy.handler.js';
import type { Json, UpstreamResponse } from '../../../application/ports/safety-service.client.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ProblemException } from '../../platform/problem-details.js';
import { CurrentAccount, Meta } from '../../shared/guards.js';

const QUERY_KEYS = ['archived', 'label', 'q', 'page', 'pageSize'];

function noteId(value: string): string {
  if (!/^[0-9a-f]{24}$/.test(value)) throw new ProblemException('NOT_FOUND', 'Nota não encontrada.');
  return value;
}

/** Só os filtros conhecidos seguem para o notes-service (que valida os valores). */
function listQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = query[key];
    if (typeof value === 'string') params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function reply(res: Response, upstream: UpstreamResponse): unknown {
  res.status(upstream.status);
  if (upstream.location) res.setHeader('Location', upstream.location);
  return upstream.body;
}

/**
 * Notas da fachada, repassadas ao notes-service. A validação dos campos é a do serviço (o erro volta
 * em Problem Details, com o mesmo `code`); o BFF garante a conta (`X-User-Id` vem do JWT).
 */
@ApiTags('notes')
@ApiBearerAuth('bearerAuth')
@Controller('notes')
export class NotesController {
  constructor(@Inject(NotesProxyHandler) private readonly notes: NotesProxyHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'listNotes',
    summary: 'Lista as notas (fixadas primeiro, depois as mais recentes)',
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async list(
    @CurrentAccount() accountId: string,
    @Query() query: Record<string, unknown>,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(
      res,
      await this.notes.forward(accountId, 'GET', `/notes${listQuery(query)}`, undefined, meta),
    );
  }

  @Post()
  @ApiOperation({ operationId: 'createNote', summary: 'Cria uma nota' })
  @ApiBody({
    description: 'Mesmo corpo do `notes-service` (`CreateNoteRequest`)',
    schema: { type: 'object' },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async create(
    @CurrentAccount() accountId: string,
    @Body() body: Json,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(res, await this.notes.forward(accountId, 'POST', '/notes', body, meta));
  }

  @Get(':noteId')
  @ApiOperation({ operationId: 'getNote', summary: 'Busca uma nota' })
  @ApiParam({ name: 'noteId', schema: { type: 'string', pattern: '^[0-9a-f]{24}$' } })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  async get(
    @CurrentAccount() accountId: string,
    @Param('noteId') id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(res, await this.notes.forward(accountId, 'GET', `/notes/${noteId(id)}`, undefined, meta));
  }

  @Put(':noteId')
  @ApiOperation({ operationId: 'updateNote', summary: 'Substitui a nota (exige a `version` atual)' })
  @ApiParam({ name: 'noteId', schema: { type: 'string', pattern: '^[0-9a-f]{24}$' } })
  @ApiBody({
    description: 'Mesmo corpo do `notes-service` (`UpdateNoteRequest`)',
    schema: { type: 'object' },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'NOT_FOUND',
    'VERSION_CONFLICT',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async update(
    @CurrentAccount() accountId: string,
    @Param('noteId') id: string,
    @Body() body: Json,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(res, await this.notes.forward(accountId, 'PUT', `/notes/${noteId(id)}`, body, meta));
  }

  @Patch(':noteId')
  @ApiOperation({
    operationId: 'patchNote',
    summary: 'Altera campos da nota (fixar, arquivar, item, converter)',
  })
  @ApiParam({ name: 'noteId', schema: { type: 'string', pattern: '^[0-9a-f]{24}$' } })
  @ApiBody({ description: 'Mesmo corpo do `notes-service` (`PatchNoteRequest`)', schema: { type: 'object' } })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'NOT_FOUND',
    'VERSION_CONFLICT',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async patch(
    @CurrentAccount() accountId: string,
    @Param('noteId') id: string,
    @Body() body: Json,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(res, await this.notes.forward(accountId, 'PATCH', `/notes/${noteId(id)}`, body, meta));
  }

  @Delete(':noteId')
  @ApiOperation({ operationId: 'deleteNote', summary: 'Apaga uma nota' })
  @ApiParam({ name: 'noteId', schema: { type: 'string', pattern: '^[0-9a-f]{24}$' } })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  async delete(
    @CurrentAccount() accountId: string,
    @Param('noteId') id: string,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    return reply(res, await this.notes.forward(accountId, 'DELETE', `/notes/${noteId(id)}`, undefined, meta));
  }
}
