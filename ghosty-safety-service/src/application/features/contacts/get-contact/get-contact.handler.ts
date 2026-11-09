import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toContactView, type ContactView } from '../../../shared/views.js';

export class GetContactHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string; contactId: string }): Promise<ContactView> {
    return this.uow.run(async ({ contacts }) => {
      const contact = await contacts.findById(query.accountId, query.contactId);
      if (!contact) throw new NotFoundError('Contato não encontrado.');
      return toContactView(contact);
    });
  }
}
