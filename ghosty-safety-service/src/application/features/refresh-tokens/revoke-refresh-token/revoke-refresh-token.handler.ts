import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';

/** Logout. Idempotente: um token desconhecido também "dá certo". */
export class RevokeRefreshTokenHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
  ) {}

  execute(command: { token: string }): Promise<void> {
    return this.uow.run(async ({ refreshTokens }) => {
      const current = await refreshTokens.findByHash(this.tokens.hash(command.token));
      if (!current) return;
      current.revoke(this.clock.now());
      await refreshTokens.update(current);
    });
  }
}
