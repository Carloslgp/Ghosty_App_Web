import { SupportNetwork } from '../../../../domain/contacts/support-network.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

/** O link do convite deixa de funcionar e as posições dos demais são compactadas. */
export class RemoveContactHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string; contactId: string }): Promise<void> {
    return this.uow.run(async ({ contacts }) => {
      const all = await contacts.listByAccount(command.accountId);
      if (!all.some((contact) => contact.id === command.contactId))
        throw new NotFoundError('Contato não encontrado.');
      await contacts.delete(command.accountId, command.contactId);
      for (const moved of new SupportNetwork(all).remove(command.contactId)) await contacts.update(moved);
    });
  }
}
