import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import { inviteUrl, telegramUrl, type SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

export interface InvitationCreated {
  contactId: string;
  token: string;
  inviteUrl: string;
  telegramUrl: string;
  expiresAt: string;
}

/**
 * Gera um token aleatório de 32 bytes (o banco guarda só o hash), válido por 72 horas para a resposta.
 * Volta o contato para pendente e invalida o link anterior. O Ghosty não envia o convite: a pessoa
 * compartilha o link como preferir.
 */
export class CreateInvitationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly config: SafetyConfig,
  ) {}

  execute(command: { accountId: string; contactId: string }): Promise<InvitationCreated> {
    return this.uow.run(async ({ contacts }) => {
      const contact = await contacts.findById(command.accountId, command.contactId);
      if (!contact) throw new NotFoundError('Contato não encontrado.');
      const { token, hash } = this.tokens.generate();
      contact.issueInvitation(hash, this.clock.now(), this.config.inviteTtlHours);
      await contacts.update(contact);
      return {
        contactId: contact.id,
        token,
        inviteUrl: inviteUrl(this.config, token),
        telegramUrl: telegramUrl(this.config, token),
        expiresAt: (contact.inviteExpiresAt as Date).toISOString(),
      };
    });
  }
}
