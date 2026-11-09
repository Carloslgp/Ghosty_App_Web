import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CancelHelpRequestHandler } from '../../../application/features/help-requests/cancel-help-request/cancel-help-request.handler.js';
import { GetHelpRequestHandler } from '../../../application/features/help-requests/get-help-request/get-help-request.handler.js';
import { ListHelpRequestsHandler } from '../../../application/features/help-requests/list-help-requests/list-help-requests.handler.js';
import { TriggerHelpRequestHandler } from '../../../application/features/help-requests/trigger-help-request/trigger-help-request.handler.js';
import type { PageView } from '../../../application/shared/pagination.js';
import type { HelpRequestSummaryView, HelpRequestView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ModePageQuery } from '../../shared/pagination.dto.js';
import {
  ApiIdempotencyKey,
  ApiUserScoped,
  ApiUuidParam,
  CorrelationId,
  IdempotencyKey,
  UuidParamPipe,
} from '../../shared/params.js';
import {
  HelpRequestPageResponse,
  HelpRequestResponse,
  TriggerHelpRequestRequest,
} from './help-requests.dto.js';

/** Pedidos de ajuda: o disparo é assíncrono (outbox → fila → Function) e o front acompanha em polling. */
@ApiTags('help-requests')
@ApiUserScoped()
@Controller('help-requests')
export class HelpRequestsController {
  constructor(
    @Inject(TriggerHelpRequestHandler) private readonly triggerHelpRequest: TriggerHelpRequestHandler,
    @Inject(ListHelpRequestsHandler) private readonly listHelpRequests: ListHelpRequestsHandler,
    @Inject(GetHelpRequestHandler) private readonly getHelpRequest: GetHelpRequestHandler,
    @Inject(CancelHelpRequestHandler) private readonly cancelHelpRequest: CancelHelpRequestHandler,
  ) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'triggerHelpRequest',
    summary: 'Dispara um pedido de ajuda',
    description:
      'Grava o pedido e o evento `HelpRequestTriggered` na mesma transação (outbox) e responde 202: o envio ' +
      'acontece depois, na Function. `mode: test` (Teste seguro) nunca envia nada. A mesma ' +
      '`Idempotency-Key` devolve o mesmo pedido, sem evento novo.',
  })
  @ApiIdempotencyKey()
  @ApiAcceptedResponse({ type: HelpRequestResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async trigger(
    @UserId() accountId: string,
    @IdempotencyKey() idempotencyKey: string,
    @CorrelationId() correlationId: string,
    @Body() body: TriggerHelpRequestRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<HelpRequestView> {
    const request = await this.triggerHelpRequest.execute({
      accountId,
      mode: body.mode,
      location: body.location
        ? {
            lat: body.location.lat,
            lng: body.location.lng,
            accuracyMeters: body.location.accuracyMeters ?? null,
          }
        : null,
      idempotencyKey,
      correlationId,
    });
    res.setHeader('Location', `/help-requests/${request.id}`);
    return request;
  }

  @Get()
  @ApiOperation({
    operationId: 'listHelpRequests',
    summary: 'Lista os pedidos de ajuda',
    description: 'Do mais novo para o mais antigo, sem a linha do tempo.',
  })
  @ApiOkResponse({ type: HelpRequestPageResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  list(
    @UserId() accountId: string,
    @Query() query: ModePageQuery,
  ): Promise<PageView<HelpRequestSummaryView>> {
    return this.listHelpRequests.execute({ accountId, ...query });
  }

  @Get(':helpRequestId')
  @ApiOperation({
    operationId: 'getHelpRequest',
    summary: 'Busca um pedido, com a linha do tempo',
    description: 'O front consulta a cada 2 segundos até `status` sair de `triggered`.',
  })
  @ApiUuidParam('helpRequestId', 'Id do pedido de ajuda')
  @ApiOkResponse({ type: HelpRequestResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  get(
    @UserId() accountId: string,
    @Param('helpRequestId', UuidParamPipe) helpRequestId: string,
  ): Promise<HelpRequestView> {
    return this.getHelpRequest.execute({ accountId, helpRequestId });
  }

  @Post(':helpRequestId/cancel')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'cancelHelpRequest',
    summary: 'Foi engano',
    description:
      '`triggered` ou `dispatched` → `cancelled`. Hoje só registra: o aviso já enviado não é desfeito. ' +
      'Pedido já cancelado ou com falha responde 409.',
  })
  @ApiUuidParam('helpRequestId', 'Id do pedido de ajuda')
  @ApiOkResponse({ type: HelpRequestResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INTERNAL_ERROR')
  cancel(
    @UserId() accountId: string,
    @Param('helpRequestId', UuidParamPipe) helpRequestId: string,
  ): Promise<HelpRequestView> {
    return this.cancelHelpRequest.execute({ accountId, helpRequestId });
  }
}
