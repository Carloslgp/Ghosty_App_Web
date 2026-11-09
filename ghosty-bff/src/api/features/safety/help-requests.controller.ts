import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { SafetyProxyHandler } from '../../../application/features/safety/safety-proxy.handler.js';
import type { Json } from '../../../application/ports/safety-service.client.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { CurrentAccount, Meta, SafetyArea } from '../../shared/guards.js';
import { ApiIdempotencyKey, forwardQuery, idempotencyHeaders, reply, uuidParam } from '../../shared/proxy.js';

const LIST_QUERY = ['mode', 'page', 'pageSize'] as const;
const helpRequestParam = () =>
  ApiParam({ name: 'helpRequestId', schema: { type: 'string', format: 'uuid' } });

/**
 * Pedidos de ajuda, repassados ao safety-service. O disparo é assíncrono (202): o envio acontece na
 * Function, e o front acompanha a linha do tempo consultando o pedido a cada 2 segundos.
 */
@ApiTags('help-requests')
@ApiBearerAuth('bearerAuth')
@ApiSecurity('safetyToken')
@SafetyArea()
@Controller('safety/help-requests')
export class HelpRequestsController {
  constructor(@Inject(SafetyProxyHandler) private readonly safety: SafetyProxyHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'listHelpRequests',
    summary: 'Lista os pedidos de ajuda (do mais novo para o mais antigo, sem a linha do tempo)',
  })
  @ApiQuery({ name: 'mode', required: false, enum: ['real', 'test'] })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1 } })
  @ApiQuery({ name: 'pageSize', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async list(
    @CurrentAccount() a: string,
    @Query() query: Record<string, unknown>,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(
      res,
      await this.safety.forward(a, 'GET', `/help-requests${forwardQuery(query, LIST_QUERY)}`, undefined, m),
    );
  }

  @Post()
  @ApiOperation({
    operationId: 'triggerHelpRequest',
    summary: 'Dispara um pedido de ajuda',
    description:
      'Responde 202 com o `Location` para o polling. `mode: test` (Teste seguro) nunca envia nada. A ' +
      'mesma `Idempotency-Key` não dispara duas vezes. A localização só é guardada se a pessoa ativou ' +
      '"incluir localização".',
  })
  @ApiIdempotencyKey()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['real', 'test'] },
        location: {
          type: 'object',
          nullable: true,
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            accuracyMeters: { type: 'number', minimum: 0, nullable: true },
          },
        },
      },
    },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async trigger(
    @CurrentAccount() a: string,
    @Body() body: Json,
    @Req() req: Request,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(
      res,
      await this.safety.forward(a, 'POST', '/help-requests', body, m, idempotencyHeaders(req)),
    );
  }

  @Get(':helpRequestId')
  @ApiOperation({ operationId: 'getHelpRequest', summary: 'Busca um pedido, com a linha do tempo' })
  @helpRequestParam()
  @ApiProblems(
    'NOT_FOUND',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async get(
    @CurrentAccount() a: string,
    @Param('helpRequestId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.safety.forward(a, 'GET', `/help-requests/${uuidParam(id)}`, undefined, m));
  }

  @Post(':helpRequestId/cancel')
  @ApiOperation({
    operationId: 'cancelHelpRequest',
    summary: 'Foi engano',
    description: 'Só registra: o aviso já enviado não é desfeito. Já cancelado ou com falha responde 409.',
  })
  @helpRequestParam()
  @ApiProblems(
    'NOT_FOUND',
    'INVALID_STATE',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async cancel(
    @CurrentAccount() a: string,
    @Param('helpRequestId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(
      res,
      await this.safety.forward(a, 'POST', `/help-requests/${uuidParam(id)}/cancel`, undefined, m),
    );
  }
}
