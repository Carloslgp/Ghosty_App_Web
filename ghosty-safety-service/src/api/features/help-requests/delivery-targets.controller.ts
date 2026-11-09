import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  GetDeliveryTargetsHandler,
  type DeliveryTargetsView,
} from '../../../application/features/help-requests/get-delivery-targets/get-delivery-targets.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal, ApiUuidParam, UuidParamPipe } from '../../shared/params.js';
import { DeliveryTargetsResponse } from './help-requests.dto.js';

/** Rota interna chamada pela Function `dispatch-alert`. */
@ApiTags('internal')
@ApiInternal()
@Controller('internal/help-requests')
export class DeliveryTargetsController {
  constructor(@Inject(GetDeliveryTargetsHandler) private readonly getTargets: GetDeliveryTargetsHandler) {}

  @Get(':helpRequestId/delivery-targets')
  @ApiOperation({
    operationId: 'getDeliveryTargets',
    summary: 'Destinos de entrega de um pedido',
    description:
      'É a única rota que devolve o chat do Telegram (decifrado). Traz também os passos já registrados, ' +
      'para a Function não enviar duas vezes o mesmo aviso quando a mensagem da fila for reprocessada.',
  })
  @ApiUuidParam('helpRequestId', 'Id do pedido de ajuda')
  @ApiOkResponse({ type: DeliveryTargetsResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  targets(@Param('helpRequestId', UuidParamPipe) helpRequestId: string): Promise<DeliveryTargetsView> {
    return this.getTargets.execute({ helpRequestId });
  }
}
