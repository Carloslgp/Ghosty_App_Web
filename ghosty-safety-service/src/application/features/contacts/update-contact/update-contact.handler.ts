import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toContactView, type ContactView } from '../../../shared/views.js';

/** Altera o apelido. */
export class UpdateContactHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string; contactId: string; nickname: string }): Promise<ContactView> {
    return this.uow.run(async ({ contacts }) => {
      const contact = await contacts.findById(command.accountId, command.contactId);
      if (!contact) throw new NotFoundError('Contato não encontrado.');
      contact.rename(command.nickname);
      await contacts.update(contact);
      return toContactView(contact);
    });
  }
}
