import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

/** Exclusão em cascata no SQL. As notas ficam no notes-service, e o BFF apaga as duas partes. */
export class DeleteAccountHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string }): Promise<void> {
    return this.uow.run(async ({ accounts }) => {
      if (!(await accounts.findById(command.accountId))) throw new NotFoundError('Conta não encontrada.');
      await accounts.delete(command.accountId);
    });
  }
}
