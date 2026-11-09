import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { toContactView, type ContactView } from '../../../shared/views.js';

export class ListContactsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string }): Promise<{ items: ContactView[] }> {
    return this.uow.run(async ({ contacts }) => ({
      items: (await contacts.listByAccount(query.accountId)).map(toContactView),
    }));
  }
}
