import { Account, normalizeEmail } from '../../../../domain/accounts/account.entity.js';
import { AlertSettings } from '../../../../domain/alert-settings/alert-settings.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { PasswordHasher } from '../../../ports/password-hasher.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { EmailInUseError } from '../../../shared/errors.js';
import { toAccountView, type AccountView } from '../../../shared/views.js';

export interface CreateAccountCommand {
  email: string;
  displayName: string;
  password: string;
}

/** Cria a conta e a mensagem com os valores padrão, na mesma transação. */
export class CreateAccountHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateAccountCommand): Promise<AccountView> {
    const email = normalizeEmail(command.email);
    const passwordHash = await this.hasher.hash(command.password);
    return this.uow.run(async ({ accounts, alertSettings }) => {
      if (await accounts.findByEmail(email)) throw new EmailInUseError();
      const account = Account.create({
        id: this.ids.newId(),
        email,
        displayName: command.displayName,
        passwordHash,
        now: this.clock.now(),
      });
      await accounts.insert(account);
      await alertSettings.save(AlertSettings.createDefault(account.id));
      return toAccountView(account);
    });
  }
}
