import type { SafetyServiceClient } from '../../../ports/safety-service.client.js';
import type { TokenService } from '../../../ports/token-service.js';
import { UpstreamError, type RequestMeta } from '../../../ports/upstream-error.js';
import { buildAuthSession, UnauthenticatedError, type AuthSession } from '../../../shared/auth-session.js';

/** E-mail inexistente e senha errada recebem a mesma resposta. */
export class LoginHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly tokens: TokenService,
  ) {}

  async execute(command: { email: string; password: string }, meta: RequestMeta): Promise<AuthSession> {
    let account;
    try {
      account = await this.safety.authenticate(command, meta);
    } catch (error) {
      if (error instanceof UpstreamError && error.code === 'UNAUTHENTICATED')
        throw new UnauthenticatedError();
      throw error;
    }
    const refresh = await this.safety.issueRefreshToken(account.id, meta);
    return buildAuthSession(this.tokens, account, refresh);
  }
}
