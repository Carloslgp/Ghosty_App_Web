import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CHECK_IN_STATUSES, type CheckInStatus } from '../../../domain/check-ins/check-in.entity.js';
import { MODES, type Mode } from '../../../domain/shared/domain-error.js';
import { ModePageQuery } from '../../shared/pagination.dto.js';

export class CheckInResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  destination!: string;

  @ApiProperty({ format: 'date-time' })
  dueAt!: string;

  @ApiProperty({ minimum: 0, maximum: 60 })
  toleranceMinutes!: number;

  @ApiProperty({ format: 'date-time', description: '`dueAt` + tolerância' })
  deadlineAt!: string;

  @ApiProperty({ enum: CHECK_IN_STATUSES })
  status!: string;

  @ApiProperty({ enum: MODES })
  mode!: string;

  @ApiProperty({ minimum: 1, description: 'Sobe a cada extensão' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiredAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Pedido de ajuda criado quando o check-in venceu',
  })
  helpRequestId!: string | null;
}

export class CheckInPageResponse {
  @ApiProperty({ type: [CheckInResponse] })
  items!: CheckInResponse[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  pageSize!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}

export class StartCheckInRequest {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Casa' })
  @IsString()
  @Length(1, 120, { message: 'entre 1 e 120 caracteres' })
  destination!: string;

  @ApiProperty({ format: 'date-time', description: 'Entre 1 minuto e 24 horas a partir de agora' })
  @IsISO8601({ strict: true }, { message: 'data em ISO 8601' })
  dueAt!: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 60,
    description: 'Padrão: o valor de `checkInToleranceMinutes` da mensagem',
  })
  @IsOptional()
  @IsInt({ message: 'precisa ser um número inteiro' })
  @Min(0)
  @Max(60)
  toleranceMinutes?: number;

  @ApiProperty({ enum: MODES })
  @IsIn(MODES, { message: 'use real ou test' })
  mode!: Mode;
}

export class ExtendCheckInRequest {
  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true }, { message: 'data em ISO 8601' })
  dueAt!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 60 })
  @IsOptional()
  @IsInt({ message: 'precisa ser um número inteiro' })
  @Min(0)
  @Max(60)
  toleranceMinutes?: number;
}

export class ListCheckInsQuery extends ModePageQuery {
  @ApiPropertyOptional({ enum: CHECK_IN_STATUSES })
  @IsOptional()
  @IsIn(CHECK_IN_STATUSES, { message: 'status desconhecido' })
  status?: CheckInStatus;
}

export class ExpireCheckInRequest {
  @ApiProperty({ minimum: 1, description: 'Versão do check-in quando o prazo foi agendado' })
  @IsInt({ message: 'precisa ser um número inteiro' })
  @Min(1)
  version!: number;
}

export class ExpireCheckInResultResponse {
  @ApiProperty({ enum: ['expired', 'ignored'] })
  result!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  helpRequestId!: string | null;
}
