import { RefreshToken } from '../../../../domain/accounts/refresh-token.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { UnauthenticatedError } from '../../../shared/errors.js';

export interface RotatedRefreshToken {
  accountId: string;
  token: string;
  expiresAt: string;
}

/** O token usado é revogado e um novo é emitido. Inexistente, vencido, revogado ou já usado: 401. */
export class RotateRefreshTokenHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: { token: string }): Promise<RotatedRefreshToken> {
    const now = this.clock.now();
    return this.uow.run(async ({ accounts, refreshTokens }) => {
      const current = await refreshTokens.findByHash(this.tokens.hash(command.token));
      if (!current || !current.isUsable(now) || !(await accounts.findById(current.accountId))) {
        throw new UnauthenticatedError();
      }
      current.revoke(now);
      await refreshTokens.update(current);
      const { token, hash } = this.tokens.generate();
      const next = RefreshToken.issue({
        id: this.ids.newId(),
        accountId: current.accountId,
        tokenHash: hash,
        now,
      });
      await refreshTokens.insert(next);
      return { accountId: current.accountId, token, expiresAt: next.expiresAt.toISOString() };
    });
  }
}
