import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
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

const LIST_QUERY = ['status', 'mode', 'page', 'pageSize'] as const;
const checkInParam = () => ApiParam({ name: 'checkInId', schema: { type: 'string', format: 'uuid' } });

/**
 * Check-in "cheguei bem", repassado ao safety-service. Se a pessoa não confirmar até o prazo, o
 * check-in vira um pedido de ajuda (fila `check-in-deadlines` → Function → safety-service).
 */
@ApiTags('check-ins')
@ApiBearerAuth('bearerAuth')
@ApiSecurity('safetyToken')
@SafetyArea()
@Controller('safety/check-ins')
export class CheckInsController {
  constructor(@Inject(SafetyProxyHandler) private readonly safety: SafetyProxyHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'listCheckIns',
    summary: 'Lista os check-ins (do mais novo para o mais antigo)',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'confirmed', 'cancelled', 'expired'] })
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
      await this.safety.forward(a, 'GET', `/check-ins${forwardQuery(query, LIST_QUERY)}`, undefined, m),
    );
  }

  @Post()
  @ApiOperation({
    operationId: 'startCheckIn',
    summary: 'Inicia um check-in',
    description:
      'O prazo é `dueAt` + tolerância (entre 1 minuto e 24 horas). Só um check-in ativo por modo; outro ' +
      'ativo responde 409. A mesma `Idempotency-Key` devolve o mesmo check-in.',
  })
  @ApiIdempotencyKey()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['destination', 'dueAt', 'mode'],
      properties: {
        destination: { type: 'string', maxLength: 120 },
        dueAt: { type: 'string', format: 'date-time' },
        toleranceMinutes: { type: 'integer', minimum: 0, maximum: 60 },
        mode: { type: 'string', enum: ['real', 'test'] },
      },
    },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'INVALID_STATE',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async start(
    @CurrentAccount() a: string,
    @Body() body: Json,
    @Req() req: Request,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.safety.forward(a, 'POST', '/check-ins', body, m, idempotencyHeaders(req)));
  }

  @Get(':checkInId')
  @ApiOperation({ operationId: 'getCheckIn', summary: 'Busca um check-in' })
  @checkInParam()
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
    @Param('checkInId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.safety.forward(a, 'GET', `/check-ins/${uuidParam(id)}`, undefined, m));
  }

  @Put(':checkInId')
  @ApiOperation({
    operationId: 'extendCheckIn',
    summary: 'Estende o prazo',
    description: 'Sobe a `version` e agenda um novo prazo. O agendamento anterior passa a ser ignorado.',
  })
  @checkInParam()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['dueAt'],
      properties: {
        dueAt: { type: 'string', format: 'date-time' },
        toleranceMinutes: { type: 'integer', minimum: 0, maximum: 60 },
      },
    },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'INVALID_STATE',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async extend(
    @CurrentAccount() a: string,
    @Param('checkInId') id: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.safety.forward(a, 'PUT', `/check-ins/${uuidParam(id)}`, body, m));
  }

  @Delete(':checkInId')
  @ApiOperation({
    operationId: 'cancelCheckIn',
    summary: 'Cancela o check-in',
    description: 'O registro continua, como `cancelled`. O prazo agendado passa a ser ignorado.',
  })
  @checkInParam()
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
    @Param('checkInId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.safety.forward(a, 'DELETE', `/check-ins/${uuidParam(id)}`, undefined, m));
  }

  @Post(':checkInId/confirm')
  @ApiOperation({
    operationId: 'confirmArrival',
    summary: 'Cheguei bem',
    description: 'Confirmar um check-in vencido, cancelado ou já confirmado responde 409.',
  })
  @checkInParam()
  @ApiProblems(
    'NOT_FOUND',
    'INVALID_STATE',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async confirm(
    @CurrentAccount() a: string,
    @Param('checkInId') id: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(
      res,
      await this.safety.forward(a, 'POST', `/check-ins/${uuidParam(id)}/confirm`, undefined, m),
    );
  }
}
