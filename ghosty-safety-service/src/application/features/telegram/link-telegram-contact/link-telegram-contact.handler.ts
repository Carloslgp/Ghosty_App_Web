import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';

export interface TelegramLinkResult {
  result: 'linked' | 'ignored';
  inviterDisplayName: string | null;
}

const IGNORED: TelegramLinkResult = { result: 'ignored', inviterDisplayName: null };

/**
 * `/start <token>` recebido pelo bot. Token válido: guarda o chat (cifrado), canal `telegram` e
 * contato `confirmed`. Token vencido, já respondido ou inexistente: `ignored`, em silêncio.
 */
export class LinkTelegramContactHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
  ) {}

  execute(command: { token: string; chatId: string }): Promise<TelegramLinkResult> {
    const now = this.clock.now();
    return this.uow.run(async ({ contacts, accounts }) => {
      const contact = await contacts.findByInviteTokenHash(this.tokens.hash(command.token));
      if (!contact || contact.invitationState(now) !== 'open') return IGNORED;
      const inviter = await accounts.findById(contact.accountId);
      if (!inviter) return IGNORED;
      contact.linkTelegram(command.chatId, now);
      await contacts.update(contact);
      return { result: 'linked', inviterDisplayName: inviter.displayName };
    });
  }
}
