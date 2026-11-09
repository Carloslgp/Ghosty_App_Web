import { SafetySession } from '../../../../domain/session/safety-session.js';
import type { BffConfig } from '../../../ports/bff-config.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { SafetyServiceClient } from '../../../ports/safety-service.client.js';
import type { SafetySessionStore } from '../../../ports/safety-session.store.js';
import type { TokenService } from '../../../ports/token-service.js';
import { UpstreamError, type RequestMeta } from '../../../ports/upstream-error.js';
import { ForbiddenError } from '../../../shared/auth-session.js';

export interface SafetySessionView {
  safetyToken: string;
  expiresIn: number;
  remoteUrl: string;
}

/**
 * Código certo: token da sessão segura e a URL do remote `safety`. Código errado ou conta bloqueada:
 * 403, sempre igual (não é 401 para o cliente não repetir a chamada, o que contaria duas tentativas).
 */
export class UnlockSafetyHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly tokens: TokenService,
    private readonly sessions: SafetySessionStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: BffConfig,
  ) {}

  async execute(command: { accountId: string; code: string }, meta: RequestMeta): Promise<SafetySessionView> {
    try {
      await this.safety.verifySecretCode(command.accountId, command.code, meta);
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        ['UNAUTHENTICATED', 'NOT_FOUND', 'VALIDATION_FAILED'].includes(error.code)
      ) {
        throw new ForbiddenError();
      }
      throw error;
    }
    const session = SafetySession.start(this.ids.newId(), command.accountId, this.clock.now());
    this.sessions.save(session);
    const signed = await this.tokens.signSafetyToken(command.accountId, session.jti);
    return {
      safetyToken: signed.token,
      expiresIn: Math.floor(this.config.safetySession.idleMs / 1000),
      remoteUrl: this.config.safetyRemoteUrl,
    };
  }
}
