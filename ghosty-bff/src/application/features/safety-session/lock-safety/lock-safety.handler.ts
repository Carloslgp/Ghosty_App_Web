import type { SafetySessionStore } from '../../../ports/safety-session.store.js';
import type { TokenService } from '../../../ports/token-service.js';

/** Saída rápida: revoga o token da sessão segura. Responde sem erro mesmo se ele já tiver vencido. */
export class LockSafetyHandler {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SafetySessionStore,
  ) {}

  async execute(command: { accountId: string; safetyToken: string | undefined }): Promise<void> {
    if (!command.safetyToken) return;
    const claims = await this.tokens.verifySafetyToken(command.safetyToken, { ignoreExpiration: true });
    if (!claims || claims.sub !== command.accountId) return;
    this.sessions.find(claims.jti)?.revoke();
  }
}
