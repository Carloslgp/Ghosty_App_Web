import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { GetAlertSettingsHandler } from '../../../application/features/alert-settings/get-alert-settings/get-alert-settings.handler.js';
import { UpdateAlertSettingsHandler } from '../../../application/features/alert-settings/update-alert-settings/update-alert-settings.handler.js';
import {
  GetSafetySummaryHandler,
  type SafetySummaryView,
} from '../../../application/features/summary/get-safety-summary/get-safety-summary.handler.js';
import type { AlertSettingsView } from '../../../application/shared/views.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiUserScoped } from '../../shared/params.js';

export class AlertSettingsResponse {
  @ApiProperty({ minLength: 1, maxLength: 3800 })
  messageTemplate!: string;

  @ApiProperty()
  includeLocation!: boolean;

  @ApiProperty({ minimum: 5, maximum: 60 })
  countdownSeconds!: number;

  @ApiProperty({ minimum: 0, maximum: 60 })
  checkInToleranceMinutes!: number;

  @ApiProperty()
  reviewed!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt!: string | null;
}

export class UpdateAlertSettingsRequest {
  @ApiProperty({ minLength: 1, maxLength: 3800, description: 'Campos: {apelido}, {nome}, {local} e {hora}' })
  @IsString()
  @Length(1, 3800, { message: 'entre 1 e 3800 caracteres' })
  messageTemplate!: string;

  @ApiProperty()
  @IsBoolean()
  includeLocation!: boolean;

  @ApiProperty({ minimum: 5, maximum: 60 })
  @IsInt()
  @Min(5)
  @Max(60)
  countdownSeconds!: number;

  @ApiProperty({ minimum: 0, maximum: 60 })
  @IsInt()
  @Min(0)
  @Max(60)
  checkInToleranceMinutes!: number;
}

export class SafetySummaryResponse {
  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  secretCodeSet!: boolean;

  @ApiProperty({
    description: 'total, confirmed, pending, declined e contacts (id, nickname, position, status, channel)',
  })
  network!: object;

  @ApiProperty({ description: 'messageTemplate, includeLocation, countdownSeconds e reviewed' })
  alertSettings!: object;

  @ApiProperty({ type: Object, nullable: true, description: 'id, destination, dueAt, deadlineAt e status' })
  activeCheckIn!: object | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'helpRequestId, at e outcome (ok, failed ou pending)',
  })
  lastTest!: object | null;
}

/** A mensagem do aviso e o resumo da área de segurança. */
@ApiUserScoped()
@Controller()
export class SettingsController {
  constructor(
    @Inject(GetAlertSettingsHandler) private readonly getSettings: GetAlertSettingsHandler,
    @Inject(UpdateAlertSettingsHandler) private readonly updateSettings: UpdateAlertSettingsHandler,
    @Inject(GetSafetySummaryHandler) private readonly getSummary: GetSafetySummaryHandler,
  ) {}

  @Get('alert-settings')
  @ApiTags('alert-settings')
  @ApiOperation({
    operationId: 'getAlertSettings',
    summary: 'Mensagem do aviso e preferências',
    description: 'Criadas com os valores padrão junto com a conta.',
  })
  @ApiOkResponse({ type: AlertSettingsResponse })
  @ApiProblems('UNAUTHENTICATED', 'INTERNAL_ERROR')
  get(@UserId() accountId: string): Promise<AlertSettingsView> {
    return this.getSettings.execute({ accountId });
  }

  @Put('alert-settings')
  @ApiTags('alert-settings')
  @ApiOperation({
    operationId: 'updateAlertSettings',
    summary: 'Salva a mensagem e as preferências',
    description: 'Marca a mensagem como revisada (`reviewedAt`).',
  })
  @ApiOkResponse({ type: AlertSettingsResponse })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  update(@UserId() accountId: string, @Body() body: UpdateAlertSettingsRequest): Promise<AlertSettingsView> {
    return this.updateSettings.execute({ accountId, ...body });
  }

  @Get('summary')
  @ApiTags('summary')
  @ApiOperation({
    operationId: 'getSafetySummary',
    summary: 'Resumo da área de segurança',
    description: 'Usado pelo `GET /aggregated-data` do BFF e para montar o pedido de prontidão da Function.',
  })
  @ApiOkResponse({ type: SafetySummaryResponse })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  summary(@UserId() accountId: string): Promise<SafetySummaryView> {
    return this.getSummary.execute({ accountId });
  }
}
