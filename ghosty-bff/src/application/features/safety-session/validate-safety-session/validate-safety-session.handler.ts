import type { BffConfig } from '../../../ports/bff-config.js';
import type { Clock } from '../../../ports/clock.js';
import type { SafetySessionStore } from '../../../ports/safety-session.store.js';
import type { TokenService } from '../../../ports/token-service.js';
import { ForbiddenError } from '../../../shared/auth-session.js';

/**
 * Confere o `X-Safety-Token` de cada chamada da área de segurança: assinatura, `scope=safety`, mesma
 * conta do JWT, não revogado e usado nos últimos 10 minutos (até 30 no total). Cada uso renova a janela.
 */
export class ValidateSafetySessionHandler {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SafetySessionStore,
    private readonly clock: Clock,
    private readonly config: BffConfig,
  ) {}

  async execute(command: { accountId: string; safetyToken: string | undefined }): Promise<void> {
    if (!command.safetyToken) throw new ForbiddenError();
    const claims = await this.tokens.verifySafetyToken(command.safetyToken);
    const session = claims ? this.sessions.find(claims.jti) : undefined;
    const now = this.clock.now();
    if (!claims || !session || claims.sub !== command.accountId || session.accountId !== command.accountId) {
      throw new ForbiddenError();
    }
    if (!session.isActive(now, this.config.safetySession)) throw new ForbiddenError();
    session.touch(now);
  }
}
