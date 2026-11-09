import { Contact } from '../../../../domain/contacts/contact.entity.js';
import { SupportNetwork } from '../../../../domain/contacts/support-network.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { toContactView, type ContactView } from '../../../shared/views.js';

/** Só o apelido. O contato entra pendente, no fim da ordem. Máximo de 10. */
export class AddContactHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: { accountId: string; nickname: string }): Promise<ContactView> {
    return this.uow.run(async ({ contacts }) => {
      const network = new SupportNetwork(await contacts.listByAccount(command.accountId));
      const contact = Contact.create({
        id: this.ids.newId(),
        accountId: command.accountId,
        nickname: command.nickname,
        position: network.nextPosition(),
        now: this.clock.now(),
      });
      await contacts.insert(contact);
      return toContactView(contact);
    });
  }
}
