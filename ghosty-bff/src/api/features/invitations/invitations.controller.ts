import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InvitationsHandler } from '../../../application/features/invitations/invitations.handler.js';
import type { Json } from '../../../application/ports/safety-service.client.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { Public } from '../../platform/public.decorator.js';
import { Meta } from '../../shared/guards.js';
import { invitationToken, reply } from '../../shared/proxy.js';

const tokenParam = () =>
  ApiParam({
    name: 'token',
    description: 'Token do convite (43 caracteres base64url)',
    schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
  });

/**
 * Página pública do convite (`/c/:token` no front): quem abre o link não tem conta. O limite de taxa
 * por IP continua valendo.
 */
@ApiTags('invitations')
@Public()
@Controller('invitations/:token')
export class InvitationsController {
  constructor(@Inject(InvitationsHandler) private readonly invitations: InvitationsHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'getInvitation',
    summary: 'Abre a página do convite',
    description:
      'Com token válido, devolve também `remoteUrl`, para o shell carregar o `safety/Invite`. Token ' +
      'desconhecido: 404 (a página mostra uma tela neutra). Vencido: 410.',
  })
  @tokenParam()
  @ApiProblems('NOT_FOUND', 'INVITATION_EXPIRED', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  async get(
    @Param('token') token: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.invitations.get(invitationToken(token), m));
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary: 'Aceita o convite',
    description:
      '`web`: o contato vira `confirmed` na hora, e a mesma página passa a mostrar os avisos. `telegram`: ' +
      'o contato só vira `confirmed` quando tocar em Iniciar no bot (link `telegramUrl`).',
  })
  @tokenParam()
  @ApiBody({
    schema: { type: 'object', required: ['channel'], properties: { channel: { enum: ['telegram', 'web'] } } },
  })
  @ApiProblems(
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'INVALID_STATE',
    'INVITATION_EXPIRED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async accept(
    @Param('token') token: string,
    @Body() body: Json,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.invitations.accept(invitationToken(token), body, m));
  }

  @Post('decline')
  @HttpCode(200)
  @ApiOperation({ operationId: 'declineInvitation', summary: 'Recusa o convite' })
  @tokenParam()
  @ApiProblems(
    'NOT_FOUND',
    'INVALID_STATE',
    'INVITATION_EXPIRED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
    'UPSTREAM_UNAVAILABLE',
  )
  async decline(
    @Param('token') token: string,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.invitations.decline(invitationToken(token), m));
  }

  @Get('alerts')
  @ApiOperation({
    operationId: 'getInvitationAlerts',
    summary: 'Avisos recebidos pelo contato do canal web',
    description:
      'A página consulta a cada 5 segundos, com `since`. Só para contatos confirmados no canal web.',
  })
  @tokenParam()
  @ApiQuery({ name: 'since', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiProblems('VALIDATION_FAILED', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE')
  async alerts(
    @Param('token') token: string,
    @Query('since') since: string | undefined,
    @Meta() m: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return reply(res, await this.invitations.alerts(invitationToken(token), since, m));
  }
}
