import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcceptInvitationHandler } from '../../../application/features/invitations/accept-invitation/accept-invitation.handler.js';
import { DeclineInvitationHandler } from '../../../application/features/invitations/decline-invitation/decline-invitation.handler.js';
import {
  GetInvitationAlertsHandler,
  type InvitationAlertsView,
} from '../../../application/features/invitations/get-invitation-alerts/get-invitation-alerts.handler.js';
import { GetInvitationHandler } from '../../../application/features/invitations/get-invitation/get-invitation.handler.js';
import type { InvitationView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal, ApiTokenParam, InvitationTokenPipe } from '../../shared/params.js';
import {
  AcceptInvitationRequest,
  InvitationAlertsQuery,
  InvitationAlertsResponse,
  InvitationViewResponse,
} from './contacts.dto.js';

/** O lado do contato: a página pública do convite (o BFF repassa sem login). */
@ApiTags('invitations')
@ApiInternal()
@ApiTokenParam()
@Controller('invitations/:token')
export class InvitationsController {
  constructor(
    @Inject(GetInvitationHandler) private readonly getInvitation: GetInvitationHandler,
    @Inject(AcceptInvitationHandler) private readonly acceptInvitation: AcceptInvitationHandler,
    @Inject(DeclineInvitationHandler) private readonly declineInvitation: DeclineInvitationHandler,
    @Inject(GetInvitationAlertsHandler) private readonly getAlerts: GetInvitationAlertsHandler,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getInvitation',
    summary: 'Abre o convite',
    description:
      'Token desconhecido, de contato removido ou substituído por um convite novo: 404. Vencido sem resposta: 410. ' +
      'Já respondido: 200 com o `status` atual.',
  })
  @ApiOkResponse({ type: InvitationViewResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INVITATION_EXPIRED', 'INTERNAL_ERROR')
  get(@Param('token', InvitationTokenPipe) token: string): Promise<InvitationView> {
    return this.getInvitation.execute({ token });
  }

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary: 'Aceita o convite',
    description:
      '`web`: o contato vira `confirmed` na hora. `telegram`: devolve o link `t.me` e o contato continua `pending` ' +
      'até o bot receber o `/start` (não conta como resposta). Uma resposta já dada responde 409.',
  })
  @ApiOkResponse({ type: InvitationViewResponse })
  @ApiProblems(
    'VALIDATION_FAILED',
    'UNAUTHENTICATED',
    'NOT_FOUND',
    'INVALID_STATE',
    'INVITATION_EXPIRED',
    'INTERNAL_ERROR',
  )
  accept(
    @Param('token', InvitationTokenPipe) token: string,
    @Body() body: AcceptInvitationRequest,
  ): Promise<InvitationView> {
    return this.acceptInvitation.execute({ token, channel: body.channel });
  }

  @Post('decline')
  @HttpCode(200)
  @ApiOperation({ operationId: 'declineInvitation', summary: 'Recusa o convite' })
  @ApiOkResponse({ type: InvitationViewResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INVITATION_EXPIRED', 'INTERNAL_ERROR')
  decline(@Param('token', InvitationTokenPipe) token: string): Promise<InvitationView> {
    return this.declineInvitation.execute({ token });
  }

  @Get('alerts')
  @ApiOperation({
    operationId: 'getInvitationAlerts',
    summary: 'Avisos do contato do canal web',
    description:
      'Só para contatos `confirmed` no canal `web` (os outros recebem 404). Passos `published_web` dos últimos ' +
      '90 dias, do mais novo para o mais antigo. Use `since` para receber só o que é novo.',
  })
  @ApiOkResponse({ type: InvitationAlertsResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  alerts(
    @Param('token', InvitationTokenPipe) token: string,
    @Query() query: InvitationAlertsQuery,
  ): Promise<InvitationAlertsView> {
    return this.getAlerts.execute({ token, since: query.since ? new Date(query.since) : undefined });
  }
}
