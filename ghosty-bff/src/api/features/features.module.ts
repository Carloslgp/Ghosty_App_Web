import { Logger, Module } from '@nestjs/common';
import { AccountHandler } from '../../application/features/account/account.handler.js';
import { LoginHandler } from '../../application/features/auth/login/login.handler.js';
import { LogoutHandler } from '../../application/features/auth/logout/logout.handler.js';
import { RefreshSessionHandler } from '../../application/features/auth/refresh-session/refresh-session.handler.js';
import { RegisterHandler } from '../../application/features/auth/register/register.handler.js';
import { NotesProxyHandler } from '../../application/features/notes/notes-proxy.handler.js';
import { LockSafetyHandler } from '../../application/features/safety-session/lock-safety/lock-safety.handler.js';
import { UnlockSafetyHandler } from '../../application/features/safety-session/unlock-safety/unlock-safety.handler.js';
import { SafetyProxyHandler } from '../../application/features/safety/safety-proxy.handler.js';
import { BFF_CONFIG } from '../../application/ports/bff-config.js';
import { CLOCK } from '../../application/ports/clock.js';
import { ID_GENERATOR } from '../../application/ports/id-generator.js';
import { NOTES_SERVICE } from '../../application/ports/notes-service.client.js';
import { SAFETY_SERVICE, type SafetyServiceClient } from '../../application/ports/safety-service.client.js';
import { SAFETY_SESSIONS } from '../../application/ports/safety-session.store.js';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token-service.js';
import type { NotesServiceClient } from '../../application/ports/notes-service.client.js';
import { provideHandler } from '../shared/provide-handler.js';
import { AccountController } from './account/account.controller.js';
import { AuthController, WellKnownController } from './auth/auth.controller.js';
import { NotesController } from './notes/notes.controller.js';
import { SafetyController, SafetySessionController } from './safety/safety.controller.js';

const LOGGER = Symbol('RegisterLogger');

/** As rotas do BFF. Os handlers não conhecem o NestJS: são montados aqui, com as portas por token. */
@Module({
  controllers: [
    AuthController,
    WellKnownController,
    AccountController,
    NotesController,
    SafetySessionController,
    SafetyController,
  ],
  providers: [
    { provide: LOGGER, useValue: new Logger('Auth') },
    {
      provide: RegisterHandler,
      useFactory: (
        safety: SafetyServiceClient,
        notes: NotesServiceClient,
        tokens: TokenService,
        logger: Logger,
      ) => new RegisterHandler(safety, notes, tokens, logger),
      inject: [SAFETY_SERVICE, NOTES_SERVICE, TOKEN_SERVICE, LOGGER],
    },
    provideHandler(LoginHandler, [SAFETY_SERVICE, TOKEN_SERVICE]),
    provideHandler(RefreshSessionHandler, [SAFETY_SERVICE, TOKEN_SERVICE]),
    provideHandler(LogoutHandler, [SAFETY_SERVICE]),
    provideHandler(AccountHandler, [SAFETY_SERVICE, NOTES_SERVICE, SAFETY_SESSIONS]),
    provideHandler(NotesProxyHandler, [NOTES_SERVICE]),
    provideHandler(SafetyProxyHandler, [SAFETY_SERVICE]),
    provideHandler(UnlockSafetyHandler, [
      SAFETY_SERVICE,
      TOKEN_SERVICE,
      SAFETY_SESSIONS,
      CLOCK,
      ID_GENERATOR,
      BFF_CONFIG,
    ]),
    provideHandler(LockSafetyHandler, [TOKEN_SERVICE, SAFETY_SESSIONS]),
  ],
})
export class FeaturesModule {}
