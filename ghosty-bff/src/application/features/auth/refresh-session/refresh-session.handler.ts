import type { SafetyServiceClient } from '../../../ports/safety-service.client.js';
import type { TokenService } from '../../../ports/token-service.js';
import { UpstreamError, type RequestMeta } from '../../../ports/upstream-error.js';
import { buildAuthSession, UnauthenticatedError, type AuthSession } from '../../../shared/auth-session.js';

/** Troca o refresh token por um novo (rotação) e devolve um JWT novo. O usado deixa de valer. */
export class RefreshSessionHandler {
  constructor(
    private readonly safety: SafetyServiceClient,
    private readonly tokens: TokenService,
  ) {}

  async execute(command: { refreshToken: string }, meta: RequestMeta): Promise<AuthSession> {
    try {
      const refresh = await this.safety.rotateRefreshToken(command.refreshToken, meta);
      const account = await this.safety.getAccount(refresh.accountId, meta);
      return await buildAuthSession(this.tokens, account, refresh);
    } catch (error) {
      if (
        error instanceof UpstreamError &&
        (error.code === 'UNAUTHENTICATED' || error.code === 'NOT_FOUND')
      ) {
        throw new UnauthenticatedError();
      }
      throw error;
    }
  }
}
