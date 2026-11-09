import { DomainError } from '../../../../domain/shared/domain-error.js';
import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { loadInvitation, toInvitationView } from '../../../shared/invitations.js';
import type { InvitationView } from '../../../shared/views.js';

/** Vencido sem resposta: 410. Já respondido: 200 com o status atual (painel de avisos ou tela neutra). */
export class GetInvitationHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly config: SafetyConfig,
  ) {}

  execute(query: { token: string }): Promise<InvitationView> {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const loaded = await loadInvitation(repos, this.tokens, query.token);
      if (loaded.contact.invitationState(now) === 'expired') {
        throw new DomainError('INVITATION_EXPIRED', 'O convite venceu sem resposta.');
      }
      return toInvitationView(loaded, query.token, now, this.config);
    });
  }
}
