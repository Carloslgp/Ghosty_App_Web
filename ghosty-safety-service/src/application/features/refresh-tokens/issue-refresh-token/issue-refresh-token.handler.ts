import { RefreshToken } from '../../../../domain/accounts/refresh-token.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

export interface RefreshTokenView {
  accountId: string;
  /** Aparece uma única vez: o banco guarda só o hash. */
  token: string;
  expiresAt: string;
}

export class IssueRefreshTokenHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: { accountId: string }): Promise<RefreshTokenView> {
    return this.uow.run(async ({ accounts, refreshTokens }) => {
      if (!(await accounts.findById(command.accountId))) throw new NotFoundError('Conta não encontrada.');
      const { token, hash } = this.tokens.generate();
      const refresh = RefreshToken.issue({
        id: this.ids.newId(),
        accountId: command.accountId,
        tokenHash: hash,
        now: this.clock.now(),
      });
      await refreshTokens.insert(refresh);
      return { accountId: command.accountId, token, expiresAt: refresh.expiresAt.toISOString() };
    });
  }
}
