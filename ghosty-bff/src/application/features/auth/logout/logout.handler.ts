import type { SafetyServiceClient } from '../../../ports/safety-service.client.js';
import type { RequestMeta } from '../../../ports/upstream-error.js';

/** Revoga o refresh token. Idempotente. */
export class LogoutHandler {
  constructor(private readonly safety: SafetyServiceClient) {}

  execute(command: { refreshToken: string }, meta: RequestMeta): Promise<void> {
    return this.safety.revokeRefreshToken(command.refreshToken, meta);
  }
}
