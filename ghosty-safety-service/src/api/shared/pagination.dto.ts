import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MODES, type Mode } from '../../domain/shared/domain-error.js';

/** `?page=1&pageSize=20`, com `pageSize` máximo de 100. */
export class PageQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'precisa ser um número inteiro' })
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'precisa ser um número inteiro' })
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ModePageQuery extends PageQuery {
  @ApiPropertyOptional({ enum: MODES })
  @IsOptional()
  @IsIn(MODES, { message: 'use real ou test' })
  mode?: Mode;
}
