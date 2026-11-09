import type { UnitOfWork } from '../../../ports/unit-of-work.js';

export interface TelegramLeaveResult {
  result: 'left' | 'ignored';
  contactsAffected: number;
}

/** `/parar` no bot: leva para `declined` todos os contatos confirmados com esse chat, em qualquer conta. */
export class LeaveTelegramContactHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { chatId: string }): Promise<TelegramLeaveResult> {
    return this.uow.run(async ({ contacts }) => {
      let affected = 0;
      for (const contact of await contacts.findConfirmedByTelegramChat(command.chatId)) {
        if (!contact.leaveTelegram()) continue;
        await contacts.update(contact);
        affected += 1;
      }
      return { result: affected > 0 ? 'left' : 'ignored', contactsAffected: affected };
    });
  }
}
