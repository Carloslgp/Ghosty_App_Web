import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toAccountView, type AccountView } from '../../../shared/views.js';

export class GetAccountHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string }): Promise<AccountView> {
    return this.uow.run(async ({ accounts }) => {
      const account = await accounts.findById(query.accountId);
      if (!account) throw new NotFoundError('Conta não encontrada.');
      return toAccountView(account);
    });
  }
}
