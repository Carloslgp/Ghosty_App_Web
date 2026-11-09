// Módulo com o que todo serviço NestJS tem: logs, `/health`, Problem Details e validação dos DTOs.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { HealthController, SERVICE_NAME } from './health.controller.js';
import { createLoggerModule } from './logger.js';
import { createValidationPipe, ProblemDetailsFilter } from './problem-details.js';

export interface PlatformOptions {
  /** Nome do serviço nos logs e no `/health` (ex.: `notes-service`). */
  service: string;
  /** Nível do log (`silent` nos testes). */
  logLevel: string;
}

@Module({})
export class PlatformModule {
  static forRoot(options: PlatformOptions): DynamicModule {
    return {
      module: PlatformModule,
      global: true,
      imports: [createLoggerModule({ service: options.service, level: options.logLevel })],
      controllers: [HealthController],
      providers: [
        { provide: SERVICE_NAME, useValue: options.service },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
      ],
      exports: [SERVICE_NAME],
    };
  }
}
