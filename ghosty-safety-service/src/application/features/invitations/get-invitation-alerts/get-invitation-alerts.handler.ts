import type { Clock } from '../../../ports/clock.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { loadInvitation } from '../../../shared/invitations.js';

export const ALERT_RETENTION_DAYS = 90;

export interface InvitationAlertsView {
  items: { helpRequestId: string; message: string; publishedAt: string }[];
}

/**
 * Os avisos publicados para um contato do canal web (passos `published_web`), do mais novo para o
 * mais antigo, dos últimos 90 dias. Outros contatos recebem 404. `since` traz só o que é novo.
 */
export class GetInvitationAlertsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
  ) {}

  execute(query: { token: string; since?: Date }): Promise<InvitationAlertsView> {
    const retention = new Date(this.clock.now().getTime() - ALERT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const after = query.since && query.since > retention ? query.since : retention;
    return this.uow.run(async (repos) => {
      const { contact } = await loadInvitation(repos, this.tokens, query.token);
      if (!contact.canSeeWebAlerts()) throw new NotFoundError('Convite não encontrado.');
      const steps = await repos.helpRequests.listPublishedWebSteps(contact.id, after);
      return {
        items: steps.map((step) => ({
          helpRequestId: step.helpRequestId,
          message: step.message ?? '',
          publishedAt: step.occurredAt.toISOString(),
        })),
      };
    });
  }
}
