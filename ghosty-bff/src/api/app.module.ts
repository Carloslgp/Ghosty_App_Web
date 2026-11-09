import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ValidateSafetySessionHandler } from '../application/features/safety-session/validate-safety-session/validate-safety-session.handler.js';
import { BFF_CONFIG } from '../application/ports/bff-config.js';
import { CLOCK } from '../application/ports/clock.js';
import { SAFETY_SESSIONS } from '../application/ports/safety-session.store.js';
import { TOKEN_SERVICE } from '../application/ports/token-service.js';
import { FeaturesModule } from './features/features.module.js';
import { InfrastructureModule, type InfrastructureOptions } from './infrastructure.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { GATEWAY_SECRET, GatewaySecretGuard, JwtAuthGuard, SafetySessionGuard } from './shared/guards.js';
import { provideHandler } from './shared/provide-handler.js';
import { BffThrottlerGuard, throttlers } from './shared/rate-limit.js';

export const SERVICE = 'bff';

export interface AppOptions extends InfrastructureOptions {
  gatewaySecret: string;
  logLevel: string;
  rateLimit: { loginPerMinute: number; userPerMinute: number };
}

/**
 * Raiz de composição do BFF. Os guards rodam nesta ordem: segredo do gateway (403), JWT (401),
 * limite de taxa (429) e sessão segura (403, só nas rotas da área de segurança).
 */
@Module({})
export class AppModule {
  static forRoot(options: AppOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.forRoot({ service: SERVICE, logLevel: options.logLevel }),
        InfrastructureModule.forRoot(options),
        ThrottlerModule.forRoot({
          throttlers: throttlers(options.rateLimit.loginPerMinute, options.rateLimit.userPerMinute),
        }),
        FeaturesModule,
      ],
      providers: [
        { provide: GATEWAY_SECRET, useValue: options.gatewaySecret },
        provideHandler(ValidateSafetySessionHandler, [TOKEN_SERVICE, SAFETY_SESSIONS, CLOCK, BFF_CONFIG]),
        { provide: APP_GUARD, useClass: GatewaySecretGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: BffThrottlerGuard },
        { provide: APP_GUARD, useClass: SafetySessionGuard },
      ],
    };
  }
}
