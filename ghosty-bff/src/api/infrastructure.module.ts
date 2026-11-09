import { Global, Module, type DynamicModule } from '@nestjs/common';
import { BFF_CONFIG, type BffConfig } from '../application/ports/bff-config.js';
import { CLOCK, type Clock } from '../application/ports/clock.js';
import { ID_GENERATOR } from '../application/ports/id-generator.js';
import { NOTES_SERVICE } from '../application/ports/notes-service.client.js';
import { SAFETY_SERVICE } from '../application/ports/safety-service.client.js';
import { SAFETY_SESSIONS } from '../application/ports/safety-session.store.js';
import { TOKEN_SERVICE } from '../application/ports/token-service.js';
import {
  NotesServiceHttpClient,
  SafetyServiceHttpClient,
} from '../infrastructure/http/internal-services.clients.js';
import { ServiceHttpClient } from '../infrastructure/http/service-http.client.js';
import { JoseTokenService, type TokenServiceOptions } from '../infrastructure/security/jose.token-service.js';
import { MemorySafetySessionStore } from '../infrastructure/security/memory-safety-session.store.js';
import { SystemClock } from '../infrastructure/system/system-clock.js';
import { UuidV7Generator } from '../infrastructure/system/uuid-id-generator.js';

export interface InfrastructureOptions {
  tokens: TokenServiceOptions;
  services: {
    notesUrl: string;
    safetyUrl: string;
    internalApiKey: string;
    timeoutMs: number;
  };
  config: BffConfig;
}

/** Raiz de composição das portas: clientes dos serviços, JWT, sessões seguras, relógio e ids. */
@Global()
@Module({})
export class InfrastructureModule {
  static forRoot(options: InfrastructureOptions): DynamicModule {
    const { services } = options;
    const http = (service: string, baseUrl: string) =>
      new ServiceHttpClient({
        service,
        baseUrl,
        internalKey: services.internalApiKey,
        timeoutMs: services.timeoutMs,
      });
    return {
      module: InfrastructureModule,
      providers: [
        { provide: CLOCK, useClass: SystemClock },
        { provide: ID_GENERATOR, useClass: UuidV7Generator },
        { provide: BFF_CONFIG, useValue: options.config },
        { provide: TOKEN_SERVICE, useFactory: () => JoseTokenService.create(options.tokens) },
        {
          provide: SAFETY_SESSIONS,
          useFactory: (clock: Clock) => new MemorySafetySessionStore(options.config.safetySession, clock),
          inject: [CLOCK],
        },
        {
          provide: SAFETY_SERVICE,
          useValue: new SafetyServiceHttpClient(http('safety-service', services.safetyUrl)),
        },
        {
          provide: NOTES_SERVICE,
          useValue: new NotesServiceHttpClient(http('notes-service', services.notesUrl)),
        },
      ],
      exports: [
        CLOCK,
        ID_GENERATOR,
        BFF_CONFIG,
        TOKEN_SERVICE,
        SAFETY_SESSIONS,
        SAFETY_SERVICE,
        NOTES_SERVICE,
      ],
    };
  }
}
