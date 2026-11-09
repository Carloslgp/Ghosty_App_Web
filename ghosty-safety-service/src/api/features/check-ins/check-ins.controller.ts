import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CancelCheckInHandler } from '../../../application/features/check-ins/cancel-check-in/cancel-check-in.handler.js';
import { ConfirmArrivalHandler } from '../../../application/features/check-ins/confirm-arrival/confirm-arrival.handler.js';
import { ExtendCheckInHandler } from '../../../application/features/check-ins/extend-check-in/extend-check-in.handler.js';
import { GetCheckInHandler } from '../../../application/features/check-ins/get-check-in/get-check-in.handler.js';
import { ListCheckInsHandler } from '../../../application/features/check-ins/list-check-ins/list-check-ins.handler.js';
import { StartCheckInHandler } from '../../../application/features/check-ins/start-check-in/start-check-in.handler.js';
import type { PageView } from '../../../application/shared/pagination.js';
import type { CheckInView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import {
  ApiIdempotencyKey,
  ApiUserScoped,
  ApiUuidParam,
  CorrelationId,
  IdempotencyKey,
  UuidParamPipe,
} from '../../shared/params.js';
import {
  CheckInPageResponse,
  CheckInResponse,
  ExtendCheckInRequest,
  ListCheckInsQuery,
  StartCheckInRequest,
} from './check-ins.dto.js';

/** Check-in "cheguei bem": se a pessoa não confirmar até o prazo, vira um pedido de ajuda. */
@ApiTags('check-ins')
@ApiUserScoped()
@Controller('check-ins')
export class CheckInsController {
  constructor(
    @Inject(StartCheckInHandler) private readonly startCheckIn: StartCheckInHandler,
    @Inject(ListCheckInsHandler) private readonly listCheckIns: ListCheckInsHandler,
    @Inject(GetCheckInHandler) private readonly getCheckIn: GetCheckInHandler,
    @Inject(ExtendCheckInHandler) private readonly extendCheckIn: ExtendCheckInHandler,
    @Inject(CancelCheckInHandler) private readonly cancelCheckIn: CancelCheckInHandler,
    @Inject(ConfirmArrivalHandler) private readonly confirmArrival: ConfirmArrivalHandler,
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'startCheckIn',
    summary: 'Inicia um check-in',
    description:
      'O prazo (`deadlineAt`) é `dueAt` + tolerância. Agenda o evento `CheckInDeadlineScheduled`. ' +
      'Só pode haver um check-in ativo por modo (`real` e `test`); outro ativo responde 409. ' +
      'A mesma `Idempotency-Key` devolve o mesmo check-in.',
  })
  @ApiIdempotencyKey()
  @ApiCreatedResponse({ type: CheckInResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INTERNAL_ERROR')
  async start(
    @UserId() accountId: string,
    @IdempotencyKey() idempotencyKey: string,
    @CorrelationId() correlationId: string,
    @Body() body: StartCheckInRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CheckInView> {
    const checkIn = await this.startCheckIn.execute({
      accountId,
      destination: body.destination,
      dueAt: new Date(body.dueAt),
      toleranceMinutes: body.toleranceMinutes,
      mode: body.mode,
      idempotencyKey,
      correlationId,
    });
    res.setHeader('Location', `/check-ins/${checkIn.id}`);
    return checkIn;
  }

  @Get()
  @ApiOperation({
    operationId: 'listCheckIns',
    summary: 'Lista os check-ins',
    description: 'Do mais novo para o mais antigo.',
  })
  @ApiOkResponse({ type: CheckInPageResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  list(@UserId() accountId: string, @Query() query: ListCheckInsQuery): Promise<PageView<CheckInView>> {
    return this.listCheckIns.execute({ accountId, ...query });
  }

  @Get(':checkInId')
  @ApiOperation({ operationId: 'getCheckIn', summary: 'Busca um check-in' })
  @ApiUuidParam('checkInId', 'Id do check-in')
  @ApiOkResponse({ type: CheckInResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  get(
    @UserId() accountId: string,
    @Param('checkInId', UuidParamPipe) checkInId: string,
  ): Promise<CheckInView> {
    return this.getCheckIn.execute({ accountId, checkInId });
  }

  @Put(':checkInId')
  @ApiOperation({
    operationId: 'extendCheckIn',
    summary: 'Estende o prazo',
    description: 'Sobe a `version` e agenda um novo prazo. O agendamento anterior passa a ser ignorado.',
  })
  @ApiUuidParam('checkInId', 'Id do check-in')
  @ApiOkResponse({ type: CheckInResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INTERNAL_ERROR')
  extend(
    @UserId() accountId: string,
    @CorrelationId() correlationId: string,
    @Param('checkInId', UuidParamPipe) checkInId: string,
    @Body() body: ExtendCheckInRequest,
  ): Promise<CheckInView> {
    return this.extendCheckIn.execute({
      accountId,
      checkInId,
      dueAt: new Date(body.dueAt),
      toleranceMinutes: body.toleranceMinutes,
      correlationId,
    });
  }

  @Delete(':checkInId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'cancelCheckIn',
    summary: 'Cancela o check-in',
    description: 'O registro continua, com status `cancelled`. O prazo agendado passa a ser ignorado.',
  })
  @ApiUuidParam('checkInId', 'Id do check-in')
  @ApiNoContentResponse({ description: 'Check-in cancelado' })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INTERNAL_ERROR')
  async cancel(
    @UserId() accountId: string,
    @Param('checkInId', UuidParamPipe) checkInId: string,
  ): Promise<void> {
    await this.cancelCheckIn.execute({ accountId, checkInId });
  }

  @Post(':checkInId/confirm')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'confirmArrival',
    summary: 'Cheguei bem',
    description: 'Confirmar um check-in vencido, cancelado ou já confirmado responde 409 `INVALID_STATE`.',
  })
  @ApiUuidParam('checkInId', 'Id do check-in')
  @ApiOkResponse({ type: CheckInResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_STATE', 'INTERNAL_ERROR')
  confirm(
    @UserId() accountId: string,
    @Param('checkInId', UuidParamPipe) checkInId: string,
  ): Promise<CheckInView> {
    return this.confirmArrival.execute({ accountId, checkInId });
  }
}
