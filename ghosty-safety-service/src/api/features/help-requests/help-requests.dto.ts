import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { CONTACT_CHANNELS } from '../../../domain/contacts/contact.entity.js';
import { DELIVERY_CHANNELS, DELIVERY_OUTCOMES } from '../../../domain/help-requests/delivery-step.js';
import {
  HELP_REQUEST_ORIGINS,
  HELP_REQUEST_STATUSES,
} from '../../../domain/help-requests/help-request.entity.js';
import { MODES, type Mode } from '../../../domain/shared/domain-error.js';

export class LocationDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  @IsOptional()
  @IsNumber({}, { message: 'precisa ser um número' })
  @Min(0)
  accuracyMeters?: number | null;
}

export class TriggerHelpRequestRequest {
  @ApiProperty({ enum: MODES, description: '`test` é o Teste seguro: nada é enviado' })
  @IsIn(MODES, { message: 'use real ou test' })
  mode!: Mode;

  @ApiPropertyOptional({
    type: LocationDto,
    nullable: true,
    description: 'Só é guardada se a pessoa ativou "incluir localização" na mensagem',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto | null;
}

export class DeliveryStepResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1 })
  stepOrder!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: '`null` no passo `no_contacts`' })
  contactId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Apelido no momento da leitura (`null` se o contato foi removido)',
  })
  contactNickname!: string | null;

  @ApiProperty({ enum: DELIVERY_CHANNELS })
  channel!: string;

  @ApiProperty({ enum: DELIVERY_OUTCOMES })
  outcome!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Texto montado para o contato' })
  message!: string | null;

  @ApiProperty({ type: String, nullable: true })
  errorCode!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;
}

export class HelpRequestSummaryResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: HELP_REQUEST_ORIGINS })
  origin!: string;

  @ApiProperty({ enum: MODES })
  mode!: string;

  @ApiProperty({ enum: HELP_REQUEST_STATUSES })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dispatchedAt!: string | null;
}

export class HelpRequestResponse extends HelpRequestSummaryResponse {
  @ApiProperty({ type: LocationDto, nullable: true })
  location!: LocationDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  checkInId!: string | null;

  @ApiProperty({
    type: [DeliveryStepResponse],
    description: 'Linha do tempo do envio, vazia enquanto `status` é `triggered`',
  })
  steps!: DeliveryStepResponse[];
}

export class HelpRequestPageResponse {
  @ApiProperty({ type: [HelpRequestSummaryResponse] })
  items!: HelpRequestSummaryResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class DeliveryTargetResponse {
  @ApiProperty({ format: 'uuid' })
  contactId!: string;

  @ApiProperty()
  nickname!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: CONTACT_CHANNELS })
  channel!: string;

  @ApiProperty({
    type: String,
    pattern: '^-?[0-9]{1,20}$',
    nullable: true,
    description: 'Só no canal `telegram`',
  })
  telegramChatId!: string | null;
}

export class RecordedStepResponse {
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  contactId!: string | null;

  @ApiProperty({ enum: DELIVERY_OUTCOMES })
  outcome!: string;
}

export class DeliveryTargetsResponse {
  @ApiProperty({ format: 'uuid' })
  helpRequestId!: string;

  @ApiProperty({ format: 'uuid' })
  accountId!: string;

  @ApiProperty({ enum: MODES })
  mode!: string;

  @ApiProperty({
    type: [DeliveryTargetResponse],
    description: 'Só os contatos confirmados, na ordem de aviso',
  })
  targets!: DeliveryTargetResponse[];

  @ApiProperty({
    type: [RecordedStepResponse],
    description: 'Passos já gravados deste pedido (reprocessamento)',
  })
  recordedSteps!: RecordedStepResponse[];
}
