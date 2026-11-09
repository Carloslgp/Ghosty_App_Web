import type { ContactChannel } from '../../../../domain/contacts/contact.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { loadInvitation, toInvitationView } from '../../../shared/invitations.js';
import type { InvitationView } from '../../../shared/views.js';

/**
 * - `web`: o contato vira `confirmed` na hora, e o mesmo link passa a mostrar os avisos.
 * - `telegram`: devolve o link `t.me` e o contato continua pendente até o bot receber o `/start`.
 *   Não conta como resposta: o contato ainda pode aceitar pelo navegador ou recusar.
 * Uma resposta já dada responde 409; vencido sem resposta, 410.
 */
export class AcceptInvitationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly config: SafetyConfig,
  ) {}

  execute(command: { token: string; channel: ContactChannel }): Promise<InvitationView> {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const loaded = await loadInvitation(repos, this.tokens, command.token);
      if (command.channel === 'web') {
        loaded.contact.acceptOnWeb(now);
        await repos.contacts.update(loaded.contact);
      } else {
        loaded.contact.assertRespondable(now);
      }
      return toInvitationView(loaded, command.token, now, this.config);
    });
  }
}
