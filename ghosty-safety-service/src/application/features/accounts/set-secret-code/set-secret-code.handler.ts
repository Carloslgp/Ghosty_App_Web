import { assertSecretCodeFormat } from '../../../../domain/accounts/account.entity.js';
import { DomainError } from '../../../../domain/shared/domain-error.js';
import type { Clock } from '../../../ports/clock.js';
import type { PasswordHasher } from '../../../ports/password-hasher.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

export interface SetSecretCodeCommand {
  accountId: string;
  currentPassword: string;
  code: string;
}

/** Define ou troca o código secreto. Exige a senha atual e zera as tentativas e o bloqueio. */
export class SetSecretCodeHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetSecretCodeCommand): Promise<void> {
    assertSecretCodeFormat(command.code);
    const account = await this.uow.run(({ accounts }) => accounts.findById(command.accountId));
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (!(await this.hasher.verify(account.passwordHash, command.currentPassword))) {
      throw DomainError.invalidField('currentPassword', 'senha atual incorreta');
    }
    const codeHash = await this.hasher.hash(command.code);
    await this.uow.run(async ({ accounts }) => {
      const fresh = await accounts.findById(command.accountId);
      if (!fresh) throw new NotFoundError('Conta não encontrada.');
      fresh.setSecretCodeHash(codeHash, this.clock.now());
      await accounts.update(fresh);
    });
  }
}
