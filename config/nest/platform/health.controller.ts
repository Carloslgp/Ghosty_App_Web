// `GET /health`: não consulta banco nem outros serviços. Serve para o healthcheck do container.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public } from './public.decorator.js';

export const SERVICE_NAME = Symbol('SERVICE_NAME');

export class HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'notes-service' })
  service!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  time!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(SERVICE_NAME) private readonly service: string) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'getHealth', summary: 'Situação do serviço' })
  @ApiOkResponse({ type: HealthResponse })
  get(): HealthResponse {
    return { status: 'ok', service: this.service, time: new Date().toISOString() };
  }
}
