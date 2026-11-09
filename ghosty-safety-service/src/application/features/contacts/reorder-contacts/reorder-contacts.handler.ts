import { SupportNetwork } from '../../../../domain/contacts/support-network.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { toContactView, type ContactView } from '../../../shared/views.js';

/** Recebe todos os ids da rede, na nova ordem. Faltar ou sobrar um id é recusado. */
export class ReorderContactsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string; contactIds: string[] }): Promise<{ items: ContactView[] }> {
    return this.uow.run(async ({ contacts }) => {
      const ordered = new SupportNetwork(await contacts.listByAccount(command.accountId)).reorder(
        command.contactIds,
      );
      for (const contact of ordered) await contacts.update(contact);
      return { items: ordered.map(toContactView) };
    });
  }
}
