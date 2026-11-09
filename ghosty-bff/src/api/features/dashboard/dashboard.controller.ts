import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import {
  GetAggregatedDataHandler,
  type AggregatedData,
} from '../../../application/features/dashboard/get-aggregated-data/get-aggregated-data.handler.js';
import type { GeoPermission } from '../../../application/ports/functions.client.js';
import type { RequestMeta } from '../../../application/ports/upstream-error.js';
import { ApiProblems } from '../../platform/openapi.js';
import { CurrentAccount, Meta, SafetyArea } from '../../shared/guards.js';

const GEO = ['granted', 'denied', 'prompt', 'unknown'] as const;

export class AggregatedDataQuery {
  @ApiPropertyOptional({
    enum: GEO,
    default: 'unknown',
    description: 'Situação da permissão de localização no navegador (`navigator.permissions`)',
  })
  @IsOptional()
  @IsIn(GEO, { message: 'use granted, denied, prompt ou unknown' })
  geo?: GeoPermission;
}

@ApiTags('dashboard')
@ApiBearerAuth('bearerAuth')
@ApiSecurity('safetyToken')
@SafetyArea()
@Controller('aggregated-data')
export class DashboardController {
  constructor(@Inject(GetAggregatedDataHandler) private readonly aggregated: GetAggregatedDataHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'getAggregatedData',
    summary: 'Painel da área de segurança em um único JSON',
    description:
      'Junta, em paralelo, o resumo das notas (`notes-service`) e o da segurança (`safety-service`), e ' +
      'depois a prontidão calculada pela Function. Cada chamada tem 3 segundos de limite. Uma fonte fora ' +
      'do ar não derruba a resposta: o bloco dela vem `null` e `sources.<fonte>` vem `unavailable` ' +
      '(continua 200). Sem a Function, a prontidão é a de reserva (`sources.readiness = "fallback"`).',
  })
  @ApiOkResponse({ description: 'Painel completo ou parcial (veja `sources`)' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'INTERNAL_ERROR')
  get(
    @CurrentAccount() accountId: string,
    @Query() query: AggregatedDataQuery,
    @Meta() meta: RequestMeta,
  ): Promise<AggregatedData> {
    return this.aggregated.execute({ accountId, geo: query.geo ?? 'unknown' }, meta);
  }
}
