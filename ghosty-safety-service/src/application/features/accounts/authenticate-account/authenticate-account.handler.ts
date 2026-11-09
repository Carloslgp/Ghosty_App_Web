import { DomainError } from '../../../../domain/shared/domain-error.js';
import { normalizeEmail } from '../../../../domain/accounts/account.entity.js';
import type { PasswordHasher } from '../../../ports/password-hasher.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { UnauthenticatedError } from '../../../shared/errors.js';
import { toAccountView, type AccountView } from '../../../shared/views.js';

export interface AuthenticateAccountCommand {
  email: string;
  password: string;
}

/**
 * Hash Argon2id de uma senha qualquer. Com e-mail inexistente, a verificação roda contra ele para
 * levar o mesmo tempo de uma senha errada.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$9sTbSlTio3Biev89thdrlKKiCaYsjjYVJxGAL3swxpQ';

/** E-mail inexistente e senha errada recebem a mesma resposta. */
export class AuthenticateAccountHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(command: AuthenticateAccountCommand): Promise<AccountView> {
    let email: string;
    try {
      email = normalizeEmail(command.email);
    } catch (error) {
      if (error instanceof DomainError) throw new UnauthenticatedError();
      throw error;
    }
    const account = await this.uow.run(({ accounts }) => accounts.findByEmail(email));
    const valid = await this.hasher.verify(account?.passwordHash ?? DUMMY_HASH, command.password);
    if (!account || !valid) throw new UnauthenticatedError();
    return toAccountView(account);
  }
}
