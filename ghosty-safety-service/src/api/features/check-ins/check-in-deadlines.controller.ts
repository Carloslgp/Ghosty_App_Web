import { Body, Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ExpireCheckInHandler,
  type ExpireCheckInResult,
} from '../../../application/features/check-ins/expire-check-in/expire-check-in.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { ApiInternal, ApiUuidParam, CorrelationId, UuidParamPipe } from '../../shared/params.js';
import { ExpireCheckInRequest, ExpireCheckInResultResponse } from './check-ins.dto.js';

/** Rota interna chamada pela Function `check-in-deadline`. */
@ApiTags('internal')
@ApiInternal()
@Controller('internal/check-ins')
export class CheckInDeadlinesController {
  constructor(@Inject(ExpireCheckInHandler) private readonly expireCheckIn: ExpireCheckInHandler) {}

  @Post(':checkInId/expire')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'expireCheckIn',
    summary: 'Vence o check-in no prazo',
    description:
      'Se o check-in estiver ativo e na mesma `version`, marca `expired` e cria um pedido de ajuda com ' +
      'origem `check_in` (com outbox). Caso contrário, responde `ignored`. É idempotente.',
  })
  @ApiUuidParam('checkInId', 'Id do check-in')
  @ApiOkResponse({ type: ExpireCheckInResultResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  expire(
    @CorrelationId() correlationId: string,
    @Param('checkInId', UuidParamPipe) checkInId: string,
    @Body() body: ExpireCheckInRequest,
  ): Promise<ExpireCheckInResult> {
    return this.expireCheckIn.execute({ checkInId, version: body.version, correlationId });
  }
}
