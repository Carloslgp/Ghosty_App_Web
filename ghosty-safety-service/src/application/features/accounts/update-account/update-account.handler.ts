import type { Clock } from '../../../ports/clock.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toAccountView, type AccountView } from '../../../shared/views.js';

export interface UpdateAccountCommand {
  accountId: string;
  displayName: string;
}

export class UpdateAccountHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  execute(command: UpdateAccountCommand): Promise<AccountView> {
    return this.uow.run(async ({ accounts }) => {
      const account = await accounts.findById(command.accountId);
      if (!account) throw new NotFoundError('Conta não encontrada.');
      account.rename(command.displayName, this.clock.now());
      await accounts.update(account);
      return toAccountView(account);
    });
  }
}
